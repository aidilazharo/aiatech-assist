'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withLock } = require('./file-lock');
const { checksum } = require('./document-editor');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const validId = s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,70}$/.test(s);
const validPart = s => typeof s === 'string' && /^[a-z][a-z0-9-]{0,70}$/.test(s);
const now = () => new Date().toISOString();
const ROLES_APPROVE = new Set(['business-owner', 'product-owner', 'project-manager', 'solution-architect', 'qa-engineer', 'release-manager']);
function rootFor(registry, projectId) { if (!validId(projectId))
    throw Error('Invalid project identity.'); return path.dirname(registry.fileFor(projectId)); }
function location(registry, projectId) { return path.join(rootFor(registry, projectId), 'sdlc', 'unified-documents.json'); }
async function safePath(root, relative) {
    if (!relative || typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some(s => !s || s === '..' || s === '.') || !/^([\w-]+\/)*[\w.-]+$/.test(relative))
        throw Error('Invalid managed document path.');
    const file = path.resolve(root, relative), base = path.resolve(root);
    if (!file.startsWith(base + path.sep))
        throw Error('Document outside project.');
    let current = base;
    for (const part of path.relative(base, file).split(path.sep)) {
        current = path.join(current, part);
        const st = await fs.lstat(current).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (st?.isSymbolicLink())
            throw Error('Refusing a symbolic link in document repository.');
    }
    return file;
}
const empty = () => ({ schema: 1, revision: 0, documents: {}, proposals: {}, outbox: [], events: [] });
function validateState(x) { if (!x || x.schema !== 1 || !Number.isSafeInteger(x.revision) || x.revision < 0 || !x.documents || !x.proposals || !Array.isArray(x.outbox) || !Array.isArray(x.events))
    throw Error('Invalid unified document repository.'); return x; }
async function load(registry, id) { const root = rootFor(registry, id), file = await safePath(root, 'sdlc/unified-documents.json'); const raw = await fs.readFile(file, 'utf8').catch(e => e.code === 'ENOENT' ? '' : Promise.reject(e)); return raw ? validateState(JSON.parse(raw)) : empty(); }
async function write(registry, id, expected, change) {
    const root = rootFor(registry, id), file = await safePath(root, 'sdlc/unified-documents.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    return withLock(file, async () => {
        const current = await load(registry, id);
        if (expected !== undefined && current.revision !== expected)
            throw Error('Document repository changed. Refresh before editing.');
        const next = structuredClone(current);
        const result = await change(next, current);
        next.revision = current.revision + 1;
        next.events = next.events.slice(-1000);
        next.outbox = next.outbox.slice(-2000);
        const tmp = file + '.' + crypto.randomUUID() + '.tmp';
        try {
            await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            await fs.rename(tmp, file);
        }
        finally {
            await fs.rm(tmp, { force: true });
        }
        // The local context index is derived, not a second source of truth.
        await require('./project-artifacts').indexCanonical(root,next).catch(()=>{});
        await require('./project-artifact-content').refreshSafe(root);
        return { state: next, result };
    });
}
const makeId = (project, kind, key) => `${project}:${kind}:${key}`;
function newDoc(id, { kind, roleId = '', taskId = '', title = '', path: sourcePath = '', sourceRefs = [], status = 'placeholder', digest = '', revision = 0, proposalPath = '', designKind = '', external = false, approval = null } = {}) {
    return { id, kind, roleId, taskId, title, path: sourcePath, sourceRefs, status, digest, contentRevision: revision, proposalPath, designKind, external, owner: null, approval, lastEditor: null, history: [], confluence: { state: 'not-synced', pageId: null, version: 0, remoteDigest: null }, updated: now() };
}
function enqueue(state, record, reason) {
    const token = sha([record.id, record.digest, record.contentRevision, reason].join('|'));
    if (!state.outbox.some(x => x.token === token))
        state.outbox.push({ token, documentId: record.id, reason, digest: record.digest, state: 'pending', at: now() });
}
function upsert(state, record) {
    const old = state.documents[record.id];
    if (!old) {
        state.documents[record.id] = record;
        state.events.push({ at: now(), action: 'registered', id: record.id });
        return record;
    }
    if (old.digest !== record.digest || old.contentRevision !== record.contentRevision || old.status !== record.status) {
        if (old.status === 'approved' && record.kind === 'role' && record.digest !== old.digest)
            throw Error('Approved document changed outside a controlled new revision. Reconcile manually.');
        if (old.status === 'approved' && record.contentRevision === old.contentRevision && (record.status !== 'approved' || record.digest !== old.digest))
            throw Error('Approved revision is immutable.');
        old.history = old.history || [];
        if (old.digest)
            old.history.push({ at: now(), digest: old.digest, status: old.status, revision: old.contentRevision, approval: old.approval || null });
        Object.assign(old, { ...record, history: old.history.slice(-100), owner: old.owner, approval: record.status === 'draft' ? null : (record.approval || old.approval), lastEditor: old.lastEditor, confluence: old.confluence });
        old.updated = now();
        enqueue(state, old, 'source-updated');
        state.events.push({ at: now(), action: 'source-updated', id: old.id });
    }
    return old;
}
async function discover(registry, id, { roles = [], brs = [], designs = {} } = {}) {
    const root = rootFor(registry, id), found = [];
    for (const role of roles)
        for (const task of role.tasks || []) {
            if (!task.document || !validPart(role.id) || !validPart(task.id))
                continue;
            const relative = 'documents/' + task.document;
            let markdown = '';
            try {
                const file = await safePath(root, relative);
                markdown = await fs.readFile(file, 'utf8');
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
            const isPlaceholder = !markdown || !markdown.replace(/<!--[^]*?-->/g, '').trim() || /^(?:# .+\n*)?(?:TODO|TBD|\[Describe|\[Insert)/i.test(markdown.trim());
            const isBaRequirement = role.id === 'business-analyst' && task.id === 'requirements';
            found.push(newDoc(makeId(id, isBaRequirement ? 'alias' : 'role', role.id + '/' + task.id), { kind: isBaRequirement ? 'alias' : 'role', roleId: role.id, taskId: task.id, title: isBaRequirement ? 'Business Requirements workspace' : task.label, path: relative, status: isBaRequirement ? 'reference-only' : isPlaceholder ? 'placeholder' : 'draft', digest: markdown ? checksum(markdown) : '', sourceRefs: isBaRequirement ? brs.filter(br => br.approvedContent).map(br => ({ id: br.id, revision: br.approvedRevision })) : [] }));
        }
    for (const br of brs) {
        if (!br.approvedContent)
            continue;
        const revision = Number(br.approvedRevision || 0), content = JSON.stringify(br.approvedContent);
        found.push(newDoc(makeId(id, 'br', br.id), { kind: 'br', title: br.approvedContent.title || br.title, external: true, status: 'approved', digest: sha(content), revision, sourceRefs: [{ id: br.id, revision }], approval: br.approval ? { ...br.approval, digest: sha(content), revision } : null }));
    }
    for (const [kind, versions] of Object.entries(designs || {})) {
        if (!Array.isArray(versions) || !versions.length)
            continue;
        const item = versions.at(-1);
        const revision = Number(item.number || 0), refs = (item.sourceBusinessRequirements || []).map(x => ({ id: String(x.id), revision: Number(x.revision) }));
        found.push(newDoc(makeId(id, 'design', kind), { kind: 'design', designKind: kind, title: item.design?.title || kind, external: true, status: item.status === 'approved' ? 'approved' : 'draft', digest: sha(item.content || JSON.stringify(item.design || {})), revision, sourceRefs: refs, approval: item.status === 'approved' ? { actor: item.approvedBy || item.approvedByName || item.actor || 'Design reviewer', at: item.approvedAt || item.at, digest: sha(item.content || JSON.stringify(item.design || {})), revision } : null }));
    }
    return found;
}
async function reconcile(registry, id, input) {
    const found = await discover(registry, id, input), original = await load(registry, id);
    for (const doc of found) {
        const prior = original.documents[doc.id];
        if (prior && doc.kind === 'role' && prior.digest === doc.digest) {
            doc.status = prior.status;
            doc.contentRevision = prior.contentRevision;
        }
    }
    const changed = found.filter(doc => !original.documents[doc.id] || original.documents[doc.id].digest !== doc.digest || original.documents[doc.id].contentRevision !== doc.contentRevision || original.documents[doc.id].status !== doc.status);
    if (!changed.length)
        return { state: original, result: { count: found.length, changed: 0, registered: found.map(x => x.id) } };
    return write(registry, id, undefined, state => { for (const doc of found)
        upsert(state, doc); return { count: found.length, changed: changed.length, registered: found.map(x => x.id) }; });
}
function resolveTarget(state, projectId, roleId, taskId) { const id = makeId(projectId, 'role', roleId + '/' + taskId); const target = state.documents[id]; if (!target || target.kind !== 'role')
    throw Error('Canonical role document not registered.'); return target; }
async function beginDocumentRevision(registry, projectId, roleId, taskId, { actor }) {
    if (!actor || typeof actor !== 'string')
        throw Error('A verified document owner is required.');
    return write(registry, projectId, undefined, state => {
        const current = resolveTarget(state, projectId, roleId, taskId);
        if (current.status !== 'approved' || !current.approval?.snapshot)
            throw Error('Only approved documents can begin a new draft revision.');
        const draft = newDoc(current.id, { ...current, status: 'draft', digest: current.digest, revision: current.contentRevision + 1 });
        upsert(state, draft);
        state.documents[current.id].lastEditor = actor;
        state.events.push({ at: now(), action: 'draft-revision-started', id: current.id, actor });
        return { id: current.id, revision: state.documents[current.id].contentRevision };
    });
}
async function propose(registry, projectId, { roleId, taskId, markdown, baseDigest, actor, sourceRefs = [] }) {
    if (!validPart(roleId) || !validPart(taskId) || typeof markdown !== 'string' || !markdown.trim() || Buffer.byteLength(markdown) > 512000)
        throw Error('Invalid document proposal.');
    if (!actor || typeof actor !== 'string')
        throw Error('Proposal actor required.');
    return write(registry, projectId, undefined, state => {
        const target = resolveTarget(state, projectId, roleId, taskId);
        if (target.status === 'approved')
            throw Error('Approved document requires a new draft revision.');
        if (baseDigest !== target.digest)
            throw Error('Document changed; review latest version before proposing.');
        const id = crypto.randomUUID();
        state.proposals[id] = { id, documentId: target.id, actor: actor.slice(0, 120), markdown, baseDigest, proposedDigest: checksum(markdown), sourceRefs, created: now(), status: 'pending', review: null };
        state.events.push({ at: now(), action: 'proposal-created', id: target.id, proposalId: id });
        return id;
    });
}
async function review(registry, projectId, proposalId, { actor, role, decision }) {
    if (!['approve', 'reject'].includes(decision) || !ROLES_APPROVE.has(role) || !actor)
        throw Error('Authorized independent reviewer required.');
    return write(registry, projectId, undefined, state => {
        const p = state.proposals[proposalId];
        if (!p || p.status !== 'pending')
            throw Error('Proposal is no longer pending.');
        if (p.actor === actor)
            throw Error('Proposer cannot approve their own AI/document proposal.');
        if (state.documents[p.documentId]?.digest !== p.baseDigest)
            throw Error('Document changed. Proposal must be reconciled.');
        p.status = decision === 'approve' ? 'review-approved' : 'rejected';
        p.review = { actor, role, decision, at: now(), digest: p.proposedDigest };
        state.events.push({ at: now(), action: 'proposal-' + decision, id: p.documentId, proposalId });
        return structuredClone(p);
    });
}
async function apply(registry, projectId, proposalId, { roleId, taskId, actor, save }) {
    if (typeof save !== 'function' || !actor)
        throw Error('Document apply requires a verified owner and controlled save.');
    let state = await load(registry, projectId), proposal = state.proposals[proposalId];
    const doc = resolveTarget(state, projectId, roleId, taskId);
    if (!proposal || proposal.documentId !== doc.id || proposal.status !== 'review-approved' || !proposal.review || proposal.review.digest !== proposal.proposedDigest)
        throw Error('Independent approved proposal required.');
    if (doc.digest !== proposal.baseDigest)
        throw Error('Document has changed. Merge conflict.');
    const saved = await save(proposal.markdown, proposal.baseDigest);
    if (!saved?.revision || saved.revision !== proposal.proposedDigest)
        throw Error('Controlled document save returned an unexpected digest.');
    const result = await write(registry, projectId, undefined, next => {
        const current = resolveTarget(next, projectId, roleId, taskId), item = next.proposals[proposalId];
        if (current.digest !== proposal.baseDigest || item.status !== 'review-approved')
            throw Error('Document repository conflict; reconcile applied file.');
        const nextDoc = newDoc(doc.id, { ...current, digest: saved.revision, status: 'draft', sourceRefs: proposal.sourceRefs, revision: current.contentRevision + 1 });
        upsert(next, nextDoc);
        item.status = 'applied';
        item.appliedAt = now();
        item.appliedBy = actor;
        return { revision: saved.revision };
    });
    return result;
}
async function recordDocumentSave(registry, id, roleId, taskId, markdown, revision, actor = '') {
    return write(registry, id, undefined, state => {
        const doc = resolveTarget(state, id, roleId, taskId);
        if (checksum(markdown) !== revision)
            throw Error('Document digest mismatch.');
        if (doc.digest === revision)
            return { unchanged: true };
        const next = newDoc(doc.id, { ...doc, digest: revision, revision: doc.contentRevision + 1, status: 'draft' });
        upsert(state, next);
        state.documents[doc.id].lastEditor = String(actor || '').slice(0, 120);
        return { unchanged: false };
    });
}
async function approveDocument(registry, projectId, roleId, taskId, { actor, reviewerRole, expectedDigest }) {
    if (!ROLES_APPROVE.has(reviewerRole) || !actor || typeof actor !== 'string')
        throw Error('Independent authorized document reviewer required.');
    const root = rootFor(registry, projectId), state = await load(registry, projectId), doc = resolveTarget(state, projectId, roleId, taskId);
    if (doc.status !== 'draft' || !doc.digest || doc.digest !== expectedDigest)
        throw Error('Only the current saved draft may be approved.');
    if (doc.lastEditor && doc.lastEditor === actor)
        throw Error('A document author cannot approve their own revision.');
    const file = await safePath(root, doc.path), text = await fs.readFile(file, 'utf8');
    if (checksum(text) !== expectedDigest)
        throw Error('Document was edited after review.');
    const savedFile = `sdlc/approved-documents/${doc.digest}.md`, immutable = await safePath(root, savedFile);
    await fs.mkdir(path.dirname(immutable), { recursive: true });
    try {
        await fs.writeFile(immutable, text, { flag: 'wx', mode: 0o600 });
    }
    catch (e) {
        if (e.code !== 'EEXIST')
            throw e;
        if (checksum(await fs.readFile(immutable, 'utf8')) !== doc.digest)
            throw Error('Approved snapshot integrity failure.');
    }
    return write(registry, projectId, state.revision, next => {
        const actual = resolveTarget(next, projectId, roleId, taskId);
        if (actual.digest !== doc.digest || actual.status !== 'draft')
            throw Error('Draft changed during approval.');
        actual.status = 'approved';
        actual.approval = { actor, role: reviewerRole, at: now(), digest: doc.digest, revision: actual.contentRevision, snapshot: savedFile };
        next.events.push({ at: now(), action: 'document-approved', id: doc.id, revision: actual.contentRevision });
        enqueue(next, actual, 'approved-revision');
        return actual.approval;
    });
}
function publicationEligibility(doc) { return doc?.status === 'approved' && !!doc.approval && doc.approval.digest === doc.digest && doc.confluence?.state !== 'conflict'; }
async function markSyncConflict(registry, projectId, documentId, reason) {
    return write(registry, projectId, undefined, state => {
        const doc = state.documents[documentId];
        if (!doc)
            throw Error('Unknown canonical document.');
        doc.confluence = { ...doc.confluence, state: 'conflict', reason: String(reason || 'External change needs review').slice(0, 250), updated: now() };
        state.events.push({ at: now(), action: 'sync-conflict', id: doc.id });
        return doc.confluence;
    });
}
async function markSynced(registry, id, documentId, { digest, pageId, version, remoteDigest }) {
    return write(registry, id, undefined, state => {
        const doc = state.documents[documentId];
        if (!publicationEligibility(doc) || doc.digest !== digest)
            throw Error('Only the approved unchanged document can be marked synchronized.');
        if (!/^\d+$/.test(String(pageId)) || !Number.isInteger(version) || version < 1)
            throw Error('Invalid Confluence publication acknowledgement.');
        doc.confluence = { state: 'synced', pageId: String(pageId), version, remoteDigest, updated: now() };
        for (const item of state.outbox)
            if (item.documentId === documentId && item.digest === digest)
                item.state = 'completed';
        return doc.confluence;
    });
}
module.exports = { rootFor, location, load, write, discover, reconcile, propose, review, apply, recordDocumentSave, approveDocument, beginDocumentRevision, resolveTarget, makeId, sha, publicationEligibility, markSynced, markSyncConflict, safePath };
