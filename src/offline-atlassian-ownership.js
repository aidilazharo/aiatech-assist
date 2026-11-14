'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withLock } = require('./file-lock');
const { accountIdentifier, identifier } = require('./ownership');
const allowed = new Set(['claim', 'request-transfer']);
function isConnectivityFailure(error) {
    let chain = error, text = '';
    for (let i = 0; i < 5 && chain; i++, chain = chain.cause)
        text += ' ' + String(chain.code || '') + ' ' + String(chain.message || '');
    if (/HTTP (401|403|404|409|412)\b|space .*not found|permission|token required|credential|account changed/i.test(text))
        return false;
    return /\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|UND_ERR_CONNECT_TIMEOUT|ABORT_ERR)\b|fetch failed|network error|network request failed|socket hang up|timed out|HTTP (429|50[0-9]|52[0-9]|53[0-9])\b/i.test(text);
}
function safeDocument(document) { return identifier(document); }
function validSnapshot(snapshot) {
    if (!snapshot || snapshot.scope !== 'jira-confluence' || !Array.isArray(snapshot.documents))
        throw Error('Invalid Atlassian ownership snapshot.');
    accountIdentifier(snapshot.me);
    return { scope: 'jira-confluence', me: snapshot.me, meName: String(snapshot.meName || snapshot.me).slice(0, 160), documents: snapshot.documents.map(d => ({ documentId: safeDocument(d.documentId), ownerId: d.ownerId || null, ownerName: d.ownerName || '', pending: d.pending || null, revision: Number.isInteger(d.revision) ? d.revision : 0, updatedAt: d.updatedAt || '' })) };
}
class OfflineAtlassianOwnership {
    constructor({ folder, project, site, spaceKey, email = '' }) {
        if (!folder || !project || !site || !spaceKey)
            throw Error('Atlassian offline cache requires project, site, and space.');
        this.binding = { project: identifier(project), site: new URL(site).origin, spaceKey: String(spaceKey).trim(), email: String(email).trim().toLowerCase() };
        const key = crypto.createHash('sha256').update(JSON.stringify(this.binding)).digest('hex');
        this.file = path.join(folder, 'atlassian-ownership', key + '.json');
    }
    async transaction(fn) {
        await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        return withLock(this.file, async () => {
            let data;
            try {
                data = JSON.parse(await fs.readFile(this.file, 'utf8'));
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
                data = { schema: 1, binding: this.binding, snapshot: null, verifiedAt: null, pending: [], history: [] };
            }
            if (data.schema !== 1 || JSON.stringify(data.binding) !== JSON.stringify(this.binding))
                throw Error('Atlassian ownership cache identity does not match this project.');
            if (!Array.isArray(data.pending) || !Array.isArray(data.history))
                throw Error('Invalid offline ownership queue.');
            const result = await fn(data);
            const tmp = this.file + '.' + crypto.randomUUID() + '.tmp';
            try {
                await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
                await fs.rename(tmp, this.file);
            }
            finally {
                await fs.rm(tmp, { force: true });
            }
            return result;
        });
    }
    async load() {
        try {
            const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
            if (data.schema !== 1 || JSON.stringify(data.binding) !== JSON.stringify(this.binding))
                throw Error('Wrong offline ownership cache project.');
            return data;
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        }
    }
    async snapshot() {
        const data = await this.load();
        if (!data?.snapshot)
            throw Error('No cached Jira identity for this project. Connect to Jira + Confluence at least once while online.');
        return { ...validSnapshot(data.snapshot), cached: true, verified: false, verifiedAt: data.verifiedAt, pendingOperations: (data.pending || []).map(x => ({ id: x.id, document: x.document, action: x.action, status: x.status, error: x.error || '' })), conflicts: (data.history || []).filter(x => x.status === 'conflict').slice(-10).map(x => ({ document: x.document, action: x.action, error: x.error || '' })) };
    }
    async remember(snapshot) {
        const normalized = validSnapshot(snapshot);
        return this.transaction(data => {
            if (data.snapshot?.me && data.snapshot.me !== normalized.me)
                throw Error('Your verified Jira account has changed. Pending offline ownership operations require manual review; they were not synchronized.');
            data.snapshot = normalized;
            data.verifiedAt = new Date().toISOString();
            return { ...normalized, verified: true, cached: false, verifiedAt: data.verifiedAt, pendingOperations: data.pending, conflicts: data.history.filter(x => x.status === 'conflict').slice(-10).map(x => ({ document: x.document, action: x.action, error: x.error || '' })) };
        });
    }
    async queue({ document, action, expectedRevision }) {
        safeDocument(document);
        if (!allowed.has(action))
            throw Error('Offline mode can only queue Claim or Request Transfer. Transfer approvals, BR approvals and publishing require live Atlassian verification.');
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
            throw Error('Invalid ownership revision.');
        return this.transaction(data => {
            if (!data.snapshot?.me)
                throw Error('Connect to Jira once before queuing offline ownership requests.');
            const record = data.snapshot.documents.find(x => x.documentId === document) || { ownerId: null, revision: 0, pending: null };
            if (record.revision !== expectedRevision)
                throw Error('Cached ownership revision changed. Refresh before requesting ownership.');
            if (action === 'claim' && record.ownerId)
                throw Error('Document is already owned. Request a transfer.');
            if (action === 'request-transfer' && (!record.ownerId || record.ownerId === data.snapshot.me || record.pending))
                throw Error('Transfer is not available for this document.');
            const existing = data.pending.find(x => x.document === document && x.status === 'pending');
            if (existing) {
                if (existing.action !== action || existing.expectedRevision !== expectedRevision)
                    throw Error('Another ownership request is already queued for this document.');
                return existing;
            }
            const entry = { id: crypto.randomUUID(), document, action, expectedRevision, actor: data.snapshot.me, createdAt: new Date().toISOString(), status: 'pending' };
            data.pending.push(entry);
            return entry;
        });
    }
    async reconcile({ fetchSnapshot, apply }) {
        await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        return withLock(this.file + '.replay', async () => this.reconcileLocked({ fetchSnapshot, apply }));
    }
    async reconcileLocked({ fetchSnapshot, apply }) {
        const initial = await this.load();
        if (!initial)
            return { synchronized: 0, conflicts: 0, pending: 0 };
        let remote = validSnapshot(await fetchSnapshot());
        if (initial.snapshot?.me && initial.snapshot.me !== remote.me)
            throw Error('Verified Jira account changed. Pending ownership requests were not replayed.');
        await this.remember(remote);
        let synchronized = 0, conflicts = 0;
        const todo = (await this.load()).pending.filter(x => x.status === 'pending');
        for (const entry of todo) {
            const record = remote.documents.find(x => x.documentId === entry.document) || { revision: 0, ownerId: null, pending: null };
            let outcome = 'completed', error = '';
            if (record.revision !== entry.expectedRevision) {
                const already = (entry.action === 'claim' && record.ownerId === entry.actor) || (entry.action === 'request-transfer' && record.pending?.to === entry.actor);
                if (!already) {
                    outcome = 'conflict';
                    error = 'Remote ownership revision changed; review and resubmit.';
                }
            }
            else {
                try {
                    await apply({ document: entry.document, action: entry.action, expectedRevision: entry.expectedRevision });
                    remote = validSnapshot(await fetchSnapshot());
                }
                catch (e) {
                    if (isConnectivityFailure(e))
                        throw e;
                    outcome = 'conflict';
                    error = String(e.message || e).slice(0, 500);
                }
            }
            await this.transaction(data => {
                const next = data.pending.find(x => x.id === entry.id);
                if (next && next.status === 'pending') {
                    next.status = outcome;
                    next.error = error;
                    next.resolvedAt = new Date().toISOString();
                    data.history.push({ ...next });
                    data.history = data.history.slice(-100);
                }
                data.pending = data.pending.filter(x => x.status === 'pending');
            });
            if (outcome === 'completed')
                synchronized++;
            else
                conflicts++;
        }
        const final = await this.remember(remote);
        return { synchronized, conflicts, pending: final.pendingOperations.length };
    }
}
module.exports = { OfflineAtlassianOwnership, isConnectivityFailure, validSnapshot };
