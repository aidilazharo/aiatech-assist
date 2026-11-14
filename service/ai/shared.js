'use strict';
const crypto = require('node:crypto');
const { getConfluenceSpace, getConfluencePage, writeConfluence, baseConfluence, requestJson } = require('../../src/clients');
const MARKER = 'ATGV_AI_MEMORY_V1:';
const titleFor = id => `ATGV AI Memory [${id}]`;
const safeId = id => { if (!/^[a-z][a-z0-9-]{0,48}$/.test(String(id)))
    throw Error('Invalid project identifier.'); return id; };
function decode(body) { const found = String(body || '').match(new RegExp(MARKER + '([A-Za-z0-9+/=]+)')); if (!found)
    throw Error('Confluence memory page has unrecognized content; refusing overwrite.'); const value = JSON.parse(Buffer.from(found[1], 'base64').toString('utf8')); if (value.schema !== 1 || !value.jobs || !value.manifest)
    throw Error('Invalid shared memory schema.'); return value; }
function assertNoSecrets(value) { const risky = /^(?:password|secret|api[_-]?key|access[_-]?token|authorization|private[_-]?key)$/i; const scan = (input) => { if (typeof input === 'string') {
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[a-z0-9._~+/=-]{16,}|(?:password|secret|api[_-]?key|access[_-]?token|authorization)\s*[:=]\s*[^\s,;]{8,}/i.test(input))
        throw Error('Potential credentials or secrets in shared memory. Refusing Confluence upload.');
}
else if (Array.isArray(input))
    for (const item of input)
        scan(item);
else if (input && typeof input === 'object')
    for (const [key, item] of Object.entries(input)) {
        if (risky.test(key) && item !== null && item !== false && item !== '')
            throw Error('Potential credentials or secrets in shared memory. Refusing Confluence upload.');
        scan(item);
    } }; scan(value); return true; }
function encode(value) { assertNoSecrets(value.manifest); const data = Buffer.from(JSON.stringify(value)); if (data.length > 460000)
    throw Error('Shared memory manifest exceeds Confluence page limit. Reduce history.'); return `<p>ATGV shared AI memory. Managed by the extension.</p><p>${MARKER}${data.toString('base64')}</p>`; }
function empty(id) { return { schema: 1, projectId: id, manifest: { schema: 1, project: id, approved: [], documents: [], decisions: [], acceptedProposals: [] }, jobs: {}, updated: new Date().toISOString() }; }
class SharedMemory {
    constructor({ config, token, projectId, request = requestJson, spaceLookup = getConfluenceSpace, pageRead = getConfluencePage, pageWrite = writeConfluence }) { this.config = config; this.token = token; this.projectId = safeId(projectId); this.request = request; this.spaceLookup = spaceLookup; this.pageRead = pageRead; this.pageWrite = pageWrite; if (!token)
        throw Error('Shared coordination requires Confluence credentials. Unattended generation is disabled until configured.'); }
    async locate() { const space = await this.spaceLookup(this.config, this.token), title = titleFor(this.projectId), root = baseConfluence(this.config); const response = await this.request(`${root}/api/v2/pages?space-id=${encodeURIComponent(space.id)}&title=${encodeURIComponent(title)}&limit=20`, { token: this.token, basicEmail: this.config.get('jira.email') }); let pages = (response.results || []).filter(x => x.title === title); if (pages.length > 1)
        throw Error('Multiple Confluence AI memory pages found. Resolve duplicates.'); if (!pages.length) {
        try {
            const created = await this.pageWrite(this.config, this.token, { spaceId: space.id, title, bodyHtml: encode(empty(this.projectId)), version: 0 });
            pages = [created];
        }
        catch (error) {
            if (!/HTTP (409|412)/.test(error.message))
                throw error;
            return this.locate();
        }
    } return { id: String(pages[0].id), spaceId: String(space.id), title }; }
    async read() { const loc = await this.locate(), page = await this.pageRead(this.config, this.token, loc.id); if (page.title !== loc.title)
        throw Error('Shared memory page title changed.'); const value = decode(page.body?.storage?.value); if (value.projectId !== this.projectId)
        throw Error('Shared memory project mismatch.'); return { ...loc, version: Number(page.version?.number || 1), value }; }
    async update(fn) { for (let attempt = 0; attempt < 5; attempt++) {
        const original = await this.read(), next = structuredClone(original.value);
        const result = await fn(next, original.value);
        if (result === false)
            return { changed: false, state: original.value };
        next.updated = new Date().toISOString();
        try {
            await this.pageWrite(this.config, this.token, { pageId: original.id, spaceId: original.spaceId, title: original.title, bodyHtml: encode(next), version: original.version });
            return { changed: true, state: next, result };
        }
        catch (error) {
            if (!/HTTP (409|412)/.test(error.message))
                throw error;
        }
    } throw Error('Shared memory changed repeatedly. Retry after other workers finish.'); }
    async acquire(jobId, worker, ttlMs = 240000) { if (!/^[a-f0-9]{64}$/.test(jobId) || !worker || ttlMs < 60000 || ttlMs > 600000)
        throw Error('Invalid shared lease.'); const now = Date.now(); const response = await this.update(state => { const old = state.jobs[jobId]; if (old?.state === 'done')
        return false; if (old?.expires > now)
        return false; state.jobs[jobId] = { worker, state: 'leased', expires: now + ttlMs, updated: new Date().toISOString(), nonce: crypto.randomUUID() }; }); return response.changed && response.state.jobs[jobId]?.worker === worker ? response.state.jobs[jobId] : null; }
    async finish(jobId, worker, nonce, success) { const result = await this.update(state => { const job = state.jobs[jobId]; if (!job || job.worker !== worker || job.nonce !== nonce || job.state !== 'leased')
        throw Error('Shared lease was lost. Discard generated result.'); job.state = success ? 'done' : 'retry'; job.expires = 0; job.updated = new Date().toISOString(); }); return result.state.jobs[jobId]; }
    async renew(jobId, worker, nonce, ttlMs = 240000) { const result = await this.update(state => { const job = state.jobs[jobId]; if (!job || job.worker !== worker || job.nonce !== nonce || job.state !== 'leased' || job.expires < Date.now())
        return false; job.expires = Date.now() + ttlMs; job.updated = new Date().toISOString(); }); return result.changed; }
    async holds(jobId, worker, nonce) { const state = (await this.read()).value.jobs[jobId]; return !!(state && state.worker === worker && state.nonce === nonce && state.state === 'leased' && state.expires > Date.now()); }
    async mergeManifest(local, baseline = {}) {
        const result = await this.update(state => {
            const remote = state.manifest || {};
            const out = { ...remote, approved: [...(remote.approved || [])], documents: [...(remote.documents || [])], decisions: [...(remote.decisions || [])], acceptedProposals: [...(remote.acceptedProposals || [])], generationHistory: [...(remote.generationHistory || [])] };
            for (const item of local.approved || []) {
                const previous = out.approved.find(x => x.brId === item.brId && x.revision === item.revision);
                if (previous && previous.digest !== item.digest)
                    throw Error('Approved BR revision conflicts with Confluence; manual reconciliation required.');
                if (!previous)
                    out.approved.push(item);
            }
            for (const kind of ['documents', 'decisions', 'acceptedProposals'])
                for (const item of local[kind] || []) {
                    const key = kind === 'documents' ? 'document_id' : kind === 'decisions' ? 'decision_id' : 'documentId';
                    const at = out[kind].findIndex(x => x[key] === item[key]);
                    if (at < 0) {
                        out[kind].push(item);
                        continue;
                    }
                    const prior = out[kind][at];
                    if (JSON.stringify(prior) === JSON.stringify(item))
                        continue;
                    const before = (baseline[kind] || []).find(x => x[key] === item[key]);
                    if (before && JSON.stringify(before) === JSON.stringify(prior)) {
                        out[kind][at] = item;
                        continue;
                    }
                    if (before && JSON.stringify(before) === JSON.stringify(item))
                        continue;
                    throw Error('Shared ' + kind + ' conflict. Manual reconciliation required.');
                }
            for (const record of local.generationHistory || [])
                if (!out.generationHistory.some(x => x.job_id === record.job_id && x.state === record.state))
                    out.generationHistory.push(record);
            out.generationHistory = out.generationHistory.slice(-120);
            for (const prop of ['projectConfig', 'enabledRoles']) {
                const before = baseline[prop], current = remote[prop], next = local[prop];
                if (next !== undefined && JSON.stringify(current) !== JSON.stringify(next)) {
                    if (before !== undefined && JSON.stringify(before) !== JSON.stringify(current) && JSON.stringify(before) !== JSON.stringify(next))
                        throw Error('Shared project configuration conflict.');
                    out[prop] = next;
                }
            }
            const compare = value => { const item = structuredClone(value); delete item.updated; return JSON.stringify(item); };
            const next = { ...out, project: local.project, schema: 1 };
            if (compare(next) === compare(remote))
                return false;
            state.manifest = { ...next, updated: new Date().toISOString() };
        });
        return result.state.manifest;
    }
}
module.exports = { SharedMemory, encode, decode, empty, titleFor, assertNoSecrets };
