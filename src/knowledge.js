'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { sha, htmlToText } = require('./utils');
const jiraStore=require('./jira-local-store');
// Only explicitly bound managed projects use the shared private project database.
// Legacy JSON stays untouched as a migration/rollback backup.
function openKnowledge(binding){
    if(!binding)return null;
    const store=jiraStore.open(binding.registry,binding.projectId);
    if(!store)return null; // Preserve standalone/legacy projects without an ATGV workspace marker.
    try{
        store.db.exec(`CREATE TABLE IF NOT EXISTS knowledge_cache_migrations (
            scope TEXT PRIMARY KEY, migrated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS knowledge_cache_documents (
            seq INTEGER PRIMARY KEY, scope TEXT NOT NULL, provider TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS knowledge_cache_scope_provider ON knowledge_cache_documents(scope,provider);`);
        return store;
    }catch(error){store.db.close();throw error;}
}
const SCOPE='knowledge-index';
function knowledgeTransaction(store,fn){
    store.db.exec('BEGIN IMMEDIATE');
    try{const result=fn();store.db.exec('COMMIT');return result;}
    catch(error){store.db.exec('ROLLBACK');throw error;}
}
function readKnowledge(store){
    return store.db.prepare('SELECT payload FROM knowledge_cache_documents WHERE scope=? ORDER BY seq').all(SCOPE).map(row=>JSON.parse(row.payload));
}
function insertKnowledge(store,documents){
    const put=store.db.prepare('INSERT INTO knowledge_cache_documents(scope,provider,payload) VALUES(?,?,?)');
    for(const doc of documents)put.run(SCOPE,String(doc.provider||''),JSON.stringify(doc));
}
function migrated(store){
    return !!store.db.prepare('SELECT scope FROM knowledge_cache_migrations WHERE scope=?').get(SCOPE);
}
function markMigrated(store){
    store.db.prepare('INSERT OR IGNORE INTO knowledge_cache_migrations VALUES(?,?)').run(SCOPE,new Date().toISOString());
}
async function readLegacyKnowledge(file){
    try{const data=JSON.parse(await fs.readFile(file,'utf8'));return Array.isArray(data.documents)?data.documents:[];}
    catch(error){if(error.code==='ENOENT')return [];throw error;}
}
async function loadKnowledge(binding,file){
    const store=openKnowledge(binding);
    if(!store)return readLegacyKnowledge(file);
    try{
        if(!migrated(store)){
            const legacy=await readLegacyKnowledge(file);
            knowledgeTransaction(store,()=>{
                if(migrated(store))return;
                insertKnowledge(store,legacy);
                markMigrated(store);
            });
        }
        return readKnowledge(store);
    }finally{store.db.close();}
}
async function writeKnowledge(binding,file,documents,provider){
    const store=openKnowledge(binding);
    if(!store)return null;
    try{
        const legacy=migrated(store)?null:await readLegacyKnowledge(file);
        return knowledgeTransaction(store,()=>{
            if(!migrated(store)){insertKnowledge(store,legacy||[]);markMigrated(store);}
            if(provider===undefined)store.db.prepare('DELETE FROM knowledge_cache_documents WHERE scope=?').run(SCOPE);
            else store.db.prepare('DELETE FROM knowledge_cache_documents WHERE scope=? AND provider=?').run(SCOPE,provider);
            insertKnowledge(store,documents);
            return readKnowledge(store);
        });
    }finally{store.db.close();}
}

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
    const corpus = chunks.map(c => tokenize(c.text + ' ' + c.title + ' ' + String(c.provider||'') + ' ' + String((c.tags||[]).join(' '))));
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
    constructor(folder, binding=null) { this.binding=binding; this.folder = folder; this.file = path.join(folder, 'knowledge.json'); this.mirrorFile = path.join(folder, 'mirrors.json'); this.docs = []; this.mirrors = {}; }
    async load() {
        await fs.mkdir(this.folder, { recursive: true });
        this.docs = await loadKnowledge(this.binding,this.file);
        try {
            this.mirrors = JSON.parse(await fs.readFile(this.mirrorFile, 'utf8'));
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
    async save() {
        const rows=await writeKnowledge(this.binding,this.file,this.docs);
        if(rows!==null){this.docs=rows;return;}
        await this.atomicWrite(this.file, JSON.stringify({ schema: 1, documents: this.docs }, null, 2));
    }
    async saveMirrors() { await this.atomicWrite(this.mirrorFile, JSON.stringify(this.mirrors, null, 2)); }
    async atomicWrite(file, data) { const tmp = file + '.tmp'; await fs.writeFile(tmp, data, { mode: 0o600 }); await fs.rename(tmp, file); }
    async replace(provider, documents) {
        const rows=await writeKnowledge(this.binding,this.file,documents,provider);
        if(rows!==null){this.docs=rows;return;}
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
