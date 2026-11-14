'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { sha, htmlToText } = require('./utils');
function tokenize(s) { return (String(s).toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []).slice(0, 15000); }
function splitChunks(text, size = 1000, overlap = 160) {
    const t = String(text || '').trim();
    if (!t)
        return [];
    const out = [];
    let start = 0;
    while (start < t.length) {
        let end = Math.min(t.length, start + size);
        if (end < t.length) {
            const n = t.lastIndexOf('\n', end);
            if (n > start + size * 0.6)
                end = n;
        }
        const content = t.slice(start, end).trim();
        if (content)
            out.push(content);
        if (end === t.length)
            break;
        start = Math.max(start + 1, end - overlap);
    }
    return out;
}
function makeChunks(docs) {
    return docs.flatMap(doc => splitChunks(doc.text).map((text, i) => ({ docId: doc.id, provider: doc.provider, title: doc.title, url: doc.url || '', text, chunk: i })));
}
function searchChunks(chunks, query, topN = 5) {
    const words = [...new Set(tokenize(query))];
    if (!words.length)
        return [];
    const corpus = chunks.map(c => tokenize(c.text + ' ' + c.title));
    const n = corpus.length;
    if (!n)
        return [];
    const avg = corpus.reduce((sum, x) => sum + x.length, 0) / n || 1;
    const df = new Map();
    for (const tokens of corpus) {
        for (const word of new Set(tokens))
            df.set(word, (df.get(word) || 0) + 1);
    }
    const ranked = [];
    for (let i = 0; i < n; i++) {
        const tokens = corpus[i], counts = new Map();
        for (const t of tokens)
            counts.set(t, (counts.get(t) || 0) + 1);
        let score = 0;
        for (const word of words) {
            const tf = counts.get(word) || 0;
            if (!tf)
                continue;
            const idf = Math.log(1 + (n - (df.get(word) || 0) + 0.5) / ((df.get(word) || 0) + 0.5));
            score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * tokens.length / avg));
        }
        if (score > 0)
            ranked.push({ ...chunks[i], score });
    }
    ranked.sort((a, b) => b.score - a.score);
    const selected = [], perDoc = new Map();
    for (const c of ranked) {
        if ((perDoc.get(c.docId) || 0) >= 2)
            continue;
        selected.push(c);
        perDoc.set(c.docId, (perDoc.get(c.docId) || 0) + 1);
        if (selected.length >= topN)
            break;
    }
    return selected;
}
class KnowledgeStore {
    constructor(folder) { this.folder = folder; this.file = path.join(folder, 'knowledge.json'); this.mirrorFile = path.join(folder, 'mirrors.json'); this.docs = []; this.mirrors = {}; }
    async load() {
        await fs.mkdir(this.folder, { recursive: true });
        try {
            const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
            this.docs = Array.isArray(data.documents) ? data.documents : [];
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        try {
            this.mirrors = JSON.parse(await fs.readFile(this.mirrorFile, 'utf8'));
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
    async save() { await this.atomicWrite(this.file, JSON.stringify({ schema: 1, documents: this.docs }, null, 2)); }
    async saveMirrors() { await this.atomicWrite(this.mirrorFile, JSON.stringify(this.mirrors, null, 2)); }
    async atomicWrite(file, data) { const tmp = file + '.tmp'; await fs.writeFile(tmp, data, { mode: 0o600 }); await fs.rename(tmp, file); }
    async replace(provider, documents) {
        this.docs = [...this.docs.filter(d => d.provider !== provider), ...documents];
        await this.save();
    }
    summary() { return { documents: this.docs.length, byProvider: this.docs.reduce((a, d) => ({ ...a, [d.provider]: (a[d.provider] || 0) + 1 }), {}), chunks: makeChunks(this.docs).length }; }
    search(query, max = 5) { return searchChunks(makeChunks(this.docs), query, max); }
    getById(id) { return this.docs.find(d => d.id === id); }
    mirrorPath(doc) { return path.join(this.folder, 'confluence', `${sha(doc.id).slice(0, 12)}-${doc.remoteId}.md`); }
    async mirrorConfluence(doc) {
        const file = this.mirrorPath(doc);
        const dir = path.dirname(file);
        await fs.mkdir(dir, { recursive: true });
        const body = `# ${doc.title}\n\n${htmlToText(doc.rawHtml)}\n`;
        const existing = this.mirrors[file];
        let changed = false;
        try {
            const current = await fs.readFile(file, 'utf8');
            if (!existing || sha(current) !== existing.syncedHash) {
                changed = true;
            }
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        if (!changed) {
            await fs.writeFile(file, body, { mode: 0o600 });
            this.mirrors[file] = { pageId: doc.remoteId, spaceId: doc.spaceId, title: doc.title, version: doc.version, syncedHash: sha(body), sourceId: doc.id };
        }
        return { file, locallyEdited: changed };
    }
    async associate(file, { pageId, spaceId, title, version, body }) {
        this.mirrors[file] = { pageId: String(pageId), spaceId: String(spaceId), title, version, syncedHash: sha(body), sourceId: '' };
        await this.saveMirrors();
    }
    async clear() { this.docs = []; await this.save(); }
}
module.exports = { tokenize, splitChunks, makeChunks, searchChunks, KnowledgeStore };
