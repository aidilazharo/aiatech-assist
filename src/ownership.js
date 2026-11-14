'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withLock } = require('./file-lock');
function identifier(id) { if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,110}$/.test(String(id || '')))
    throw new Error('Invalid identifier.'); return id; }
function accountIdentifier(value) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 255 || /[\x00-\x1f\x7f]/.test(value) || !value.trim())
        throw new Error('Invalid verified user identifier. Reconnect your Jira account.');
    return value;
}
const clone = o => JSON.parse(JSON.stringify(o));
function transitionOwnership(record, { actor, actorName, action, expectedRevision }) {
    const displayName = typeof actorName === 'string' ? actorName.trim().slice(0, 160).replace(/[\x00-\x1f\x7f]/g, '') : '';
    accountIdentifier(actor);
    const d = clone(record || { ownerId: null, revision: 0, pending: null });
    if (!Number.isInteger(expectedRevision) || expectedRevision !== d.revision)
        throw new Error(`Ownership revision conflict; current revision ${d.revision}. Refresh first.`);
    if (action === 'claim') {
        if (d.ownerId)
            throw new Error('Document is already owned; request a transfer.');
        d.ownerId = actor;
        if (displayName)
            d.ownerName = displayName;
    }
    else if (action === 'request-transfer') {
        if (!d.ownerId)
            throw new Error('Unowned document: claim it instead.');
        if (d.ownerId === actor)
            throw new Error('You already own the document.');
        if (d.pending)
            throw new Error('An ownership transfer request is already pending.');
        d.pending = { from: d.ownerId, to: actor, requestedAt: new Date().toISOString(), ...(displayName ? { toName: displayName } : {}) };
    }
    else if (action === 'cancel-transfer') {
        if (!d.pending)
            throw new Error('No pending transfer.');
        if (d.pending.to !== actor)
            throw new Error('Only the requesting user can cancel their transfer request.');
        d.pending = null;
    }
    else if (action === 'approve-transfer' || action === 'reject-transfer') {
        if (!d.pending)
            throw new Error('No pending transfer.');
        if (d.ownerId !== actor || d.pending.from !== actor)
            throw new Error('Only the current document owner can approve or reject.');
        if (action === 'approve-transfer') {
            d.ownerId = d.pending.to;
            d.ownerName = d.pending.toName || d.pending.to;
        }
        d.pending = null;
    }
    else
        throw new Error('Unknown ownership action.');
    d.revision++;
    d.updatedAt = new Date().toISOString();
    return d;
}
class OwnershipRegistry {
    constructor(file) { this.file = file; this.lock = Promise.resolve(); }
    async transaction(fn) {
        const prior = this.lock;
        let done;
        this.lock = new Promise(resolve => done = resolve);
        await prior;
        try {
            await fs.mkdir(path.dirname(this.file), { recursive: true });
            return await withLock(this.file, async () => {
                let db;
                try {
                    db = JSON.parse(await fs.readFile(this.file, 'utf8'));
                }
                catch (e) {
                    if (e.code !== 'ENOENT')
                        throw e;
                    db = { documents: {}, events: [] };
                }
                const result = fn(db);
                if (result.changed) {
                    db.events = db.events.slice(-2000);
                    await fs.mkdir(path.dirname(this.file), { recursive: true });
                    const temp = this.file + '.' + crypto.randomUUID() + '.tmp';
                    try {
                        await fs.writeFile(temp, JSON.stringify(db, null, 2), { flag: 'wx', mode: 0o600 });
                        await fs.rename(temp, this.file);
                    }
                    finally {
                        await fs.rm(temp, { force: true });
                    }
                }
                return result.value;
            });
        }
        finally {
            done();
        }
    }
    async list(project) { identifier(project); return this.transaction(db => ({ changed: false, value: Object.entries(db.documents).filter(([k]) => k.startsWith(project + '/')).map(([k, v]) => ({ documentId: k.split('/').slice(1).join('/'), ...clone(v) })) })); }
    async act({ project, document, actor, action, target, expectedRevision }) {
        identifier(project);
        identifier(document);
        identifier(actor);
        if (target)
            identifier(target);
        return this.transaction(db => {
            const k = `${project}/${document}`;
            const d = transitionOwnership(db.documents[k], { actor, action, expectedRevision });
            db.documents[k] = d;
            db.events.push({ project, document, actor, action, target: target || null, revision: d.revision, at: d.updatedAt });
            return { changed: true, value: clone(d) };
        });
    }
}
module.exports = { OwnershipRegistry, identifier, accountIdentifier, transitionOwnership };
