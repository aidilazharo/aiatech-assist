'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function databaseCtor() { try {
    return require('node:sqlite').DatabaseSync;
}
catch {
    throw Error('Persistent AI memory requires Node.js 22.13+ with node:sqlite. Upgrade the independent service runtime.');
} }
function safeRoot(root) { const resolved = path.resolve(root); if (!fs.statSync(resolved).isDirectory())
    throw Error('Invalid project folder.'); return resolved; }
class ProjectMemory {
    constructor(root) {
        this.root = safeRoot(root);
        const folder = path.join(this.root, 'knowledge');
        if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink())
            throw Error('Unsafe memory directory.');
        fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
        const file = path.join(folder, 'ai-memory.sqlite');
        if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
            throw Error('Unsafe AI memory database.');
        this.file = file;
        this.db = new (databaseCtor())(file);
        try {
            fs.chmodSync(file, 0o600);
        }
        catch { }
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; PRAGMA foreign_keys=ON;');
        try {
            fs.writeFileSync(path.join(folder, '.gitignore'), 'ai-memory.sqlite*\nai-service.json\n', { flag: 'wx', mode: 0o600 });
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
        }
        this.db.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS approved (br_id TEXT NOT NULL, revision TEXT NOT NULL, digest TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(br_id, revision));
 CREATE TABLE IF NOT EXISTS documents (document_id TEXT PRIMARY KEY, role_id TEXT NOT NULL, task_id TEXT NOT NULL, digest TEXT NOT NULL, metadata TEXT NOT NULL, updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS decisions (decision_id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS proposals (job_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, base_digest TEXT NOT NULL, input_digest TEXT NOT NULL, status TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, document_id TEXT NOT NULL, input_digest TEXT NOT NULL, state TEXT NOT NULL, worker TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, started TEXT NOT NULL, finished TEXT, status TEXT NOT NULL, inspected INTEGER NOT NULL DEFAULT 0, generated INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS operations (operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, updated TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS proposal_status ON proposals(status, updated);
 CREATE INDEX IF NOT EXISTS job_status ON jobs(state, updated);`);
    }
    close() { this.db.close(); }
    tx(fn) { this.db.exec('BEGIN IMMEDIATE'); try {
        const result = fn();
        this.db.exec('COMMIT');
        return result;
    }
    catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
    } }
    get(key, fallback = null) { const row = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
    set(key, value) { this.db.prepare('INSERT INTO kv VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(key, JSON.stringify(value), new Date().toISOString()); }
    syncBR(register) { const count = this.db.prepare('SELECT count(*) n FROM approved').get().n; this.tx(() => { for (const br of register.brs || []) {
        const history = Array.isArray(br.approvedRevisions) ? br.approvedRevisions : [];
        const revisions = [...history.map(x => ({ revision: x.revision, content: x.content })), ...(br.approvedContent && br.approvedRevision ? [{ revision: br.approvedRevision, content: br.approvedContent }] : [])];
        for (const entry of revisions) {
            if (!entry.content || !entry.revision)
                continue;
            const revision = String(entry.revision), data = JSON.stringify(entry.content), digest = hash(data);
            const existing = this.db.prepare('SELECT digest FROM approved WHERE br_id=? AND revision=?').get(br.id, revision);
            if (existing && existing.digest !== digest)
                throw Error('Immutable approved BR revision changed for ' + br.id);
            if (!existing)
                this.db.prepare('INSERT INTO approved VALUES(?,?,?,?,?)').run(br.id, revision, digest, data, new Date().toISOString());
        }
    } }); return { before: count, after: this.db.prepare('SELECT count(*) n FROM approved').get().n }; }
    approved() { return this.db.prepare('SELECT * FROM approved ORDER BY br_id,revision').all().map(x => ({ ...x, data: JSON.parse(x.data) })); }
    documentMeta(id) { const item = this.db.prepare('SELECT * FROM documents WHERE document_id=?').get(id); return item ? { ...item, metadata: JSON.parse(item.metadata) } : null; }
    document(id, role, task, digest, metadata = {}) { this.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET role_id=excluded.role_id,task_id=excluded.task_id,digest=excluded.digest,metadata=excluded.metadata,updated=excluded.updated').run(id, role, task, digest, JSON.stringify(metadata), new Date().toISOString()); }
    proposal(item) { const now = new Date().toISOString(); this.db.prepare('INSERT INTO proposals VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id) DO NOTHING').run(item.jobId, item.documentId, item.baseDigest, item.inputDigest, 'pending', item.content, JSON.stringify(item.metadata || {}), now, now); return this.db.prepare('SELECT * FROM proposals WHERE job_id=?').get(item.jobId); }
    proposals(status) { const rows = status ? this.db.prepare('SELECT * FROM proposals WHERE status=? ORDER BY created DESC LIMIT 200').all(status) : this.db.prepare('SELECT * FROM proposals ORDER BY created DESC LIMIT 200').all(); return rows.map(x => ({ ...x, metadata: JSON.parse(x.metadata) })); }
    decide(jobId, status, content) { if (!['accepted', 'rejected'].includes(status))
        throw Error('Invalid proposal decision.'); return this.tx(() => { const row = this.db.prepare('SELECT * FROM proposals WHERE job_id=?').get(jobId); if (!row || row.status !== 'pending')
        throw Error('Proposal was already handled. Refresh.'); this.db.prepare('UPDATE proposals SET status=?,content=?,updated=? WHERE job_id=? AND status=?').run(status, content ?? row.content, new Date().toISOString(), jobId, 'pending'); return row; }); }
    startRun() { const id = crypto.randomUUID(); this.db.prepare('INSERT INTO runs(id,started,status) VALUES(?,?,?)').run(id, new Date().toISOString(), 'running'); return id; }
    finishRun(id, status, inspected = 0, generated = 0, error = '') { this.db.prepare('UPDATE runs SET status=?,finished=?,inspected=?,generated=?,error=? WHERE id=?').run(status, new Date().toISOString(), inspected, generated, String(error).slice(0, 1000), id); }
    runs() { return this.db.prepare('SELECT * FROM runs ORDER BY started DESC LIMIT 30').all(); }
    job(jobId, documentId, inputDigest, worker) { this.db.prepare('INSERT INTO jobs(job_id,document_id,input_digest,state,worker,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(job_id) DO NOTHING').run(jobId, documentId, inputDigest, 'queued', worker, new Date().toISOString()); }
    jobState(jobId, state, worker, error = '') { this.db.prepare('UPDATE jobs SET state=?,worker=?,error=?,attempts=attempts+1,updated=? WHERE job_id=?').run(state, worker, String(error).slice(0, 1000), new Date().toISOString(), jobId); }
    jobs() { return this.db.prepare('SELECT * FROM jobs ORDER BY updated DESC LIMIT 100').all(); }
    queueOperation(kind, body) { const id = hash([kind, body]); this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING').run(id, kind, JSON.stringify(body), 'pending', 0, new Date().toISOString()); return id; }
    operations() { return this.db.prepare('SELECT * FROM operations WHERE status!=? ORDER BY updated ASC').all('complete'); }
    completeOperation(id) { this.db.prepare('UPDATE operations SET status=?,updated=? WHERE operation_id=?').run('complete', new Date().toISOString(), id); }
    retryOperation(id, error) { this.db.prepare('UPDATE operations SET attempts=attempts+1,updated=? WHERE operation_id=?').run(new Date().toISOString(), id); this.event('sync-retry', { operationId: id, error: String(error).slice(0, 300) }); }
    recordDecision(kind, data) { const id = hash([kind, data]); this.db.prepare('INSERT INTO decisions VALUES(?,?,?,?) ON CONFLICT(decision_id) DO NOTHING').run(id, kind, JSON.stringify(data), new Date().toISOString()); return id; }
    event(kind, data) { this.db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(crypto.randomUUID(), kind, JSON.stringify(data), new Date().toISOString()); }
    status() { return { file: this.file, approved: this.db.prepare('SELECT count(*) n FROM approved').get().n, queued: this.db.prepare('SELECT count(*) n FROM proposals WHERE status=?').get('pending').n, failed: this.db.prepare('SELECT count(*) n FROM jobs WHERE state=?').get('failed').n, runs: this.runs(), jobs: this.jobs(), proposals: this.proposals() }; }
    decisions() { return this.db.prepare('SELECT * FROM decisions ORDER BY updated DESC LIMIT 200').all().map(x => ({ ...x, data: JSON.parse(x.data) })); }
    importShared(manifest, project) { if (!manifest || manifest.schema !== 1 || manifest.project !== project || !Array.isArray(manifest.approved) || !Array.isArray(manifest.decisions) || !Array.isArray(manifest.documents))
        throw Error('Incompatible Confluence memory manifest.'); if (manifest.approved.length > 1000 || manifest.decisions.length > 2000 || manifest.documents.length > 2000)
        throw Error('Confluence memory exceeds import limits.'); return this.tx(() => { let approved = 0, decisions = 0; for (const item of manifest.approved) {
        if (!item || typeof item.brId !== 'string' || typeof item.revision !== 'string' || !/^[a-f0-9]{64}$/.test(item.digest) || !item.data || typeof item.data !== 'object')
            throw Error('Invalid shared approved BR record.');
        const data = JSON.stringify(item.data);
        if (hash(data) !== item.digest)
            throw Error('Shared approved BR digest mismatch.');
        const existing = this.db.prepare('SELECT digest FROM approved WHERE br_id=? AND revision=?').get(item.brId, item.revision);
        if (existing && existing.digest !== item.digest)
            throw Error('Shared approved BR conflicts with immutable local revision: ' + item.brId);
        if (!existing) {
            this.db.prepare('INSERT INTO approved VALUES(?,?,?,?,?)').run(item.brId, item.revision, item.digest, data, new Date().toISOString());
            approved++;
        }
    } for (const item of manifest.decisions) {
        if (!item || typeof item.decision_id !== 'string' || typeof item.kind !== 'string' || typeof item.updated !== 'string')
            throw Error('Invalid shared decision.');
        const data = JSON.stringify(item.data);
        const old = this.db.prepare('SELECT data FROM decisions WHERE decision_id=?').get(item.decision_id);
        if (old && old.data !== data)
            throw Error('Shared decision conflicts with local history.');
        if (!old) {
            this.db.prepare('INSERT INTO decisions VALUES(?,?,?,?)').run(item.decision_id, item.kind, data, item.updated);
            decisions++;
        }
    } this.set('shared-documents', manifest.documents); this.set('shared-accepted-proposals', manifest.acceptedProposals || []); this.set('shared-generation-history', manifest.generationHistory || []); this.set('shared-project-config', manifest.projectConfig || null); this.set('shared-enabled-roles', manifest.enabledRoles || null); this.set('shared-manifest', manifest); this.set('shared-sync', new Date().toISOString()); return { approved, decisions }; }); }
    manifest(project) { return { schema: 1, project, projectConfig: this.get('project', null), enabledRoles: this.get('roles', null), approved: this.approved().map(x => ({ brId: x.br_id, revision: x.revision, digest: x.digest, data: x.data })), documents: this.db.prepare('SELECT document_id,role_id,task_id,digest,metadata FROM documents').all().map(x => { const metadata = JSON.parse(x.metadata); return { document_id: x.document_id, role_id: x.role_id, task_id: x.task_id, digest: x.digest, metadata: { path: metadata.path, title: metadata.title, brRefs: metadata.brRefs } }; }), decisions: this.db.prepare('SELECT * FROM decisions').all().map(x => ({ ...x, data: JSON.parse(x.data) })), acceptedProposals: this.proposals('accepted').map(x => ({ documentId: x.document_id, inputDigest: x.input_digest, contentDigest: hash(x.content), updated: x.updated })), generationHistory: this.db.prepare('SELECT job_id,document_id,input_digest,state,updated FROM jobs ORDER BY updated DESC LIMIT 80').all(), updated: new Date().toISOString() }; }
}
module.exports = { ProjectMemory, hash };
