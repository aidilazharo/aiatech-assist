'use strict';
const zlib = require('node:zlib');
const MAX_STREAMS = 1500, MAX_STREAM_SIZE = 8 * 1024 * 1024, MAX_TOTAL_TEXT = 2 * 1024 * 1024;
function ascii85(buffer) {
    const s = buffer.toString('latin1');
    let accum = 0, count = 0;
    const out = [];
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === 126)
            break;
        if (c === 122 && count === 0) {
            out.push(0, 0, 0, 0);
            continue;
        }
        if (c <= 32)
            continue;
        if (c < 33 || c > 117)
            throw Error('Invalid ASCII85-encoded PDF stream.');
        accum = accum * 85 + c - 33;
        count++;
        if (count === 5) {
            out.push((accum / 16777216) & 255, (accum / 65536) & 255, (accum / 256) & 255, accum & 255);
            accum = 0;
            count = 0;
        }
        if (out.length > MAX_STREAM_SIZE)
            throw Error('PDF stream exceeds safe decompression limit.');
    }
    if (count > 1) {
        for (let j = count; j < 5; j++)
            accum = accum * 85 + 84;
        for (let j = 0; j < count - 1; j++)
            out.push((accum / Math.pow(256, 3 - j)) & 255);
    }
    return Buffer.from(out);
}
function asciiHex(buffer) { return Buffer.from(buffer.toString('latin1').replace(/>.*$/s, '').replace(/\s+/g, '').replace(/[^\da-f]/gi, ''), 'hex'); }
function decodeStream(raw, head) {
    const filter = head.match(/\/Filter\s*(\[[^\]]+\]|\/\w+)/s)?.[1] || '';
    const filters = [...filter.matchAll(/\/(ASCII85Decode|A85|ASCIIHexDecode|AHx|FlateDecode|Fl|RunLengthDecode|LZWDecode|DCTDecode|JPXDecode)/g)].map(m => m[1]);
    if (!filters.length && /\/Filter\s*\//.test(head))
        return null;
    let b = raw;
    for (const f of filters) {
        if (['ASCII85Decode', 'A85'].includes(f))
            b = ascii85(b);
        else if (['ASCIIHexDecode', 'AHx'].includes(f))
            b = asciiHex(b);
        else if (['FlateDecode', 'Fl'].includes(f))
            b = zlib.inflateSync(b, { maxOutputLength: MAX_STREAM_SIZE });
        else
            return null;
        if (b.length > MAX_STREAM_SIZE)
            throw Error('PDF stream exceeds safe decompression limit.');
    }
    return b;
}
function parsePdfObjects(data) {
    const latin = data.toString('latin1');
    const objects = new Map();
    const header = /(?:^|[\r\n])\s*(\d+)\s+(\d+)\s+obj\b/g;
    let m, n = 0;
    while ((m = header.exec(latin)) && n++ < MAX_STREAMS * 3) {
        const start = header.lastIndex, end = latin.indexOf('endobj', start);
        if (end < 0)
            continue;
        const body = latin.slice(start, end), streamMatch = /\bstream\r?\n/.exec(body);
        const obj = { body: streamMatch ? body.slice(0, streamMatch.index) : body, stream: null };
        if (streamMatch) {
            const streamStart = start + streamMatch.index + streamMatch[0].length;
            const lenMatch = obj.body.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
            let len = lenMatch ? Number(lenMatch[1]) : null;
            const trailing = latin.indexOf('endstream', streamStart);
            if (trailing >= 0) {
                if (len === null || len < 0 || len > MAX_STREAM_SIZE || streamStart + len > trailing + 3)
                    len = trailing - streamStart;
                if (len >= 0 && len <= MAX_STREAM_SIZE) {
                    try {
                        obj.stream = decodeStream(data.subarray(streamStart, streamStart + len), obj.body);
                    }
                    catch {
                        obj.stream = null;
                    }
                }
            }
        }
        objects.set(Number(m[1]), obj);
        header.lastIndex = end + 6;
    }
    return objects;
}
function utf16be(hex) { const b = Buffer.from(hex, 'hex'); if (!b.length)
    return ''; if (b.length % 2 === 0) {
    const arr = [];
    for (let i = 0; i < b.length; i += 2)
        arr.push(b.readUInt16BE(i));
    return String.fromCharCode(...arr);
} return b.toString('latin1'); }
function cmapFromText(src) {
    const map = new Map();
    let widths = new Set();
    for (const m of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const kv of m[1].matchAll(/<([a-f\d]+)>\s*<([a-f\d]+)>/gi)) {
            map.set(kv[1].toUpperCase(), utf16be(kv[2]));
            widths.add(kv[1].length / 2);
        }
    }
    for (const m of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
        for (const ln of m[1].split(/\r?\n/)) {
            const r = ln.match(/<([a-f\d]+)>\s*<([a-f\d]+)>\s*(<([a-f\d]+)>|\[([^\]]*)\])/i);
            if (!r)
                continue;
            const start = parseInt(r[1], 16), end = parseInt(r[2], 16), bytes = r[1].length / 2;
            if (end - start > 4096)
                continue;
            widths.add(bytes);
            const vals = r[5] ? [...r[5].matchAll(/<([a-f\d]+)>/gi)].map(x => utf16be(x[1])) : null;
            for (let i = start; i <= end; i++) {
                const code = i.toString(16).toUpperCase().padStart(bytes * 2, '0');
                if (vals)
                    map.set(code, vals[i - start] || '');
                else {
                    const dest = Buffer.from(r[4], 'hex');
                    const suffix = dest.length - 2;
                    if (suffix < 0)
                        continue;
                    dest.writeUInt16BE((dest.readUInt16BE(suffix) + i - start) & 0xffff, suffix);
                    map.set(code, utf16be(dest.toString('hex')));
                }
            }
        }
    }
    return { map, widths: [...widths].sort((a, b) => b - a) };
}
function pdfStringBytes(token) {
    if (token[0] === '<') {
        return Buffer.from(token.slice(1, -1).replace(/\s/g, '').replace(/[^a-f\d]/gi, ''), 'hex');
    }
    const out = [];
    const s = token.slice(1, -1);
    for (let i = 0; i < s.length; i++) {
        let c = s.charCodeAt(i);
        if (c !== 92) {
            out.push(c & 255);
            continue;
        }
        const ch = s[++i];
        if (ch === undefined)
            break;
        if (ch === '\r') {
            if (s[i + 1] === '\n')
                i++;
            continue;
        }
        if (ch === '\n')
            continue;
        if (/[0-7]/.test(ch)) {
            let oct = ch;
            for (let j = 0; j < 2 && /[0-7]/.test(s[i + 1] || ''); j++)
                oct += s[++i];
            out.push(parseInt(oct, 8) & 255);
            continue;
        }
        out.push(({ 'n': 10, 'r': 13, 't': 9, 'b': 8, 'f': 12, '(': 40, ')': 41, '\\': 92 }[ch]) ?? ch.charCodeAt(0));
    }
    return Buffer.from(out);
}
const CP1252 = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ' };
function decodeFont(bytes, font) {
    if (font?.map?.size) {
        let text = '';
        let pos = 0;
        while (pos < bytes.length) {
            let found = false;
            for (const size of font.widths) {
                if (pos + size > bytes.length)
                    continue;
                const hex = bytes.subarray(pos, pos + size).toString('hex').toUpperCase();
                if (font.map.has(hex)) {
                    text += font.map.get(hex);
                    pos += size;
                    found = true;
                    break;
                }
            }
            if (!found) {
                const c = bytes[pos++];
                text += CP1252[c] || String.fromCharCode(c);
            }
        }
        return text;
    }
    return [...bytes].map(c => CP1252[c] || String.fromCharCode(c)).join('');
}
function lexPdfText(src) {
    const tok = [];
    for (let i = 0; i < src.length;) {
        let c = src[i];
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        if (c === '%') {
            const n = src.indexOf('\n', i);
            i = n < 0 ? src.length : n + 1;
            continue;
        }
        if (c === '(') {
            let d = 1, j = i + 1;
            for (; j < src.length && d; j++) {
                if (src[j] === '\\') {
                    j++;
                    continue;
                }
                if (src[j] === '(')
                    d++;
                else if (src[j] === ')')
                    d--;
            }
            tok.push(src.slice(i, j));
            i = j;
            continue;
        }
        if (c === '<') {
            if (src[i + 1] === '<') {
                tok.push('<<');
                i += 2;
                continue;
            }
            const j = src.indexOf('>', i + 1);
            if (j < 0)
                break;
            tok.push(src.slice(i, j + 1));
            i = j + 1;
            continue;
        }
        if (c === '[' || c === ']') {
            tok.push(c);
            i++;
            continue;
        }
        if (c === '/') {
            let j = i + 1;
            while (j < src.length && !/[\s\[\]()<>/%]/.test(src[j]))
                j++;
            tok.push(src.slice(i, j));
            i = j;
            continue;
        }
        let j = i + 1;
        while (j < src.length && !/[\s\[\]()<>/%]/.test(src[j]))
            j++;
        tok.push(src.slice(i, j));
        i = j;
        if (tok.length > 300000)
            break;
    }
    return tok;
}
function extractTextFromStream(src, fonts) {
    const tokens = lexPdfText(src);
    const chunks = [];
    let activeFont = null;
    let inText = false;
    function append(v) { if (v) {
        chunks.push(v);
    } }
    function makeLine() { if (chunks.length && chunks[chunks.length - 1] !== '\n')
        chunks.push('\n'); }
    let values = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === 'BT') {
            inText = true;
            values = [];
            continue;
        }
        if (t === 'ET') {
            makeLine();
            inText = false;
            values = [];
            continue;
        }
        if (!inText)
            continue;
        if (t === 'Tf') {
            const name = values.findLast?.(x => typeof x === 'string' && x.startsWith('/'));
            activeFont = fonts.get(name?.slice(1)) || null;
            values = [];
            continue;
        }
        if (t === 'Tj' || t === "'" || t === '"') {
            const str = values.findLast?.(x => typeof x === 'string' && (x.startsWith('(') || /^<[^<]/.test(x)));
            if (t !== 'Tj')
                makeLine();
            if (str)
                append(decodeFont(pdfStringBytes(str), activeFont));
            values = [];
            continue;
        }
        if (t === 'TJ') {
            const begin = values.lastIndexOf('['), after = begin >= 0 ? values.slice(begin + 1) : values;
            for (const v of after) {
                if (v[0] === '(' || /^<[^<]/.test(v))
                    append(decodeFont(pdfStringBytes(v), activeFont));
                else if (/^-\d{3,}/.test(v))
                    append(' ');
            }
            values = [];
            continue;
        }
        if (t === 'T*' || t === 'Td' || t === 'TD' || t === 'Tm') {
            makeLine();
            values = [];
            continue;
        }
        if (/^[-+\d.]+$/.test(t) || t.startsWith('/') || t[0] === '(' || t[0] === '<' || t === '[' || t === ']') {
            values.push(t);
            if (values.length > 10000)
                values.shift();
        }
        else
            values = [];
    }
    return chunks.join('').trim();
}
function extractOfflinePdfText(data) {
    if (!Buffer.isBuffer(data) || !data.subarray(0, 8).toString('latin1').startsWith('%PDF-'))
        throw Error('This file is not a valid PDF.');
    const objects = parsePdfObjects(data);
    const fontNames = new Map();
    for (const [_, obj] of objects) {
        for (const m of obj.body.matchAll(/\/([A-Za-z][\w+.-]*)\s+(\d+)\s+\d+\s+R/g)) {
            const ref = objects.get(Number(m[2]));
            if (ref && /\/Type\s*\/Font\b|\/Subtype\s*\/(?:TrueType|Type0|Type1)\b/.test(ref.body))
                fontNames.set(m[1], Number(m[2]));
        }
    }
    const fonts = new Map();
    for (const [name, id] of fontNames) {
        const o = objects.get(id);
        const mapId = o?.body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/)?.[1];
        const cmap = mapId ? objects.get(Number(mapId))?.stream : null;
        if (cmap)
            fonts.set(name, cmapFromText(cmap.toString('latin1')));
    }
    const parts = [];
    let streams = 0;
    for (const [id, obj] of objects) {
        if (!obj.stream || ++streams > MAX_STREAMS)
            continue;
        if (/\/Subtype\s*\/Image\b|\/FontFile[23]?\b/.test(obj.body))
            continue;
        const src = obj.stream.toString('latin1');
        if (!/\bBT\b/.test(src) || !/\b(?:Tj|TJ|ET)\b/.test(src))
            continue;
        const result = extractTextFromStream(src, fonts);
        if (result)
            parts.push(result);
        if (parts.join('\n').length > MAX_TOTAL_TEXT)
            break;
    }
    const result = parts.join('\n').replace(/\0/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
    return result.slice(0, MAX_TOTAL_TEXT);
}
module.exports = { extractOfflinePdfText };
