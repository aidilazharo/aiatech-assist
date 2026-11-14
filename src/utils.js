'use strict';
const crypto = require('node:crypto');
function textFromAdf(node) {
    if (!node)
        return '';
    if (typeof node === 'string')
        return node;
    if (Array.isArray(node))
        return node.map(textFromAdf).filter(Boolean).join(' ');
    if (node.type === 'hardBreak')
        return '\n';
    const direct = node.type === 'text' ? (node.text || '') : '';
    const child = Array.isArray(node.content) ? node.content.map(textFromAdf).join(node.type === 'bulletList' || node.type === 'orderedList' ? '\n' : '') : '';
    const result = direct + child;
    return ['paragraph', 'heading', 'listItem', 'tableRow'].includes(node.type) ? result + '\n' : result;
}
function decodeHtmlEntities(s) {
    return s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
        .replace(/&#x([\da-f]+);/gi, (_, d) => String.fromCodePoint(Math.min(parseInt(d, 16), 0x10ffff)))
        .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e]));
}
function htmlToText(html) {
    return decodeHtmlEntities(String(html || '')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(p|h[1-6]|div|li|tr|ul|ol|pre)>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, ' ').replace(/\r/g, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .split('\n').map(s => s.replace(/ {2,}/g, ' ').trim()).join('\n')).trim();
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function markdownToStorage(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    let out = '', inList = false, inFence = false, fence = [];
    function closeList() { if (inList) {
        out += '</ul>';
        inList = false;
    } }
    for (const raw of lines) {
        const s = raw.trim();
        if (/^```/.test(s)) {
            closeList();
            if (inFence) {
                out += '<pre>' + escapeHtml(fence.join('\n')) + '</pre>';
                fence = [];
                inFence = false;
            }
            else
                inFence = true;
            continue;
        }
        if (inFence) {
            fence.push(raw);
            continue;
        }
        if (!s) {
            closeList();
            continue;
        }
        const heading = /^(#{1,6})\s+(.+)$/.exec(s);
        if (heading) {
            closeList();
            out += `<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`;
            continue;
        }
        const list = /^[-*+]\s+(.+)$/.exec(s);
        if (list) {
            if (!inList) {
                out += '<ul>';
                inList = true;
            }
            out += '<li>' + escapeHtml(list[1]) + '</li>';
            continue;
        }
        closeList();
        out += '<p>' + escapeHtml(s) + '</p>';
    }
    if (inFence)
        out += '<pre>' + escapeHtml(fence.join('\n')) + '</pre>';
    closeList();
    return out || '<p></p>';
}
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function validateUrl(v, { local = false } = {}) {
    let u;
    try {
        u = new URL(v);
    }
    catch {
        throw new Error('Invalid endpoint URL.');
    }
    if (u.username || u.password || u.search || u.hash)
        throw new Error('Endpoint must not contain credentials, query strings or fragments.');
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname)))
        throw new Error('HTTPS is required (except loopback model endpoints).');
    return u.toString().replace(/\/$/, '');
}
module.exports = { textFromAdf, htmlToText, escapeHtml, markdownToStorage, sha, validateUrl };
