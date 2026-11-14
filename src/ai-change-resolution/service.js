'use strict';
const crypto = require('node:crypto');
const clone = value => JSON.parse(JSON.stringify(value));
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const allowed = new Set(['detected', 'draft', 'previewed', 'approved', 'applied', 'conflict', 'rejected', 'superseded']);
class ChangeResolutionError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'ChangeResolutionError';
        this.code = code;
    }
}
function validateActor(actor) {
    if (!actor || typeof actor.id !== 'string' || !actor.id.trim()) {
        throw new ChangeResolutionError('ACTOR_REQUIRED', 'An authenticated user is required.');
    }
}
function validatePlan(plan) {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.changes) || !plan.changes.length) {
        throw new ChangeResolutionError('INVALID_PLAN', 'AI must return a plan containing at least one proposed change.');
    }
    for (const change of plan.changes) {
        if (!change || typeof change.artifactId !== 'string' || !change.artifactId.trim()) {
            throw new ChangeResolutionError('INVALID_PLAN', 'Each proposed change needs a stable artifact identifier.');
        }
        if (!['create', 'update', 'remove'].includes(change.operation)) {
            throw new ChangeResolutionError('INVALID_PLAN', 'Unsupported proposed change operation.');
        }
        if (change.operation === 'remove' && typeof change.reason !== 'string') {
            throw new ChangeResolutionError('INVALID_PLAN', 'Removal requires an explicit reason.');
        }
    }
    return {
        summary: String(plan.summary || 'AI-proposed resolution'),
        rationale: String(plan.rationale || ''),
        risk: String(plan.risk || 'Review required'),
        changes: clone(plan.changes),
        dependencies: Array.isArray(plan.dependencies) ? clone(plan.dependencies) : []
    };
}
class AIChangeResolutionService {
    constructor({ store, model, workflow, authorize, clock = () => new Date().toISOString() }) {
        if (!store || !model || !workflow || typeof authorize !== 'function') {
            throw new Error('store, model, workflow and authorize integrations are required.');
        }
        this.store = store;
        this.model = model;
        this.workflow = workflow;
        this.authorize = authorize;
        this.clock = clock;
    }
    async gate(action, projectId, actor, issue) {
        validateActor(actor);
        const granted = await this.authorize({ action, projectId, actor, issue: clone(issue) });
        if (!granted)
            throw new ChangeResolutionError('FORBIDDEN', `Permission denied: ${action}.`);
    }
    async snapshot(projectId) {
        const cases = await this.store.list(projectId);
        return clone(cases.filter(entry => allowed.has(entry.status)).sort((a, b) => a.id.localeCompare(b.id)));
    }
    async ingest(projectId, findings, actor) {
        if (!Array.isArray(findings))
            throw new ChangeResolutionError('INVALID_INPUT', 'Expected detected issue list.');
        await this.gate('detect', projectId, actor, { id: 'all' });
        const existing = await this.snapshot(projectId);
        const seen = new Set();
        for (const input of findings) {
            if (!input || !input.id || !input.title || !input.sourceFingerprint) {
                throw new ChangeResolutionError('INVALID_INPUT', 'Issue id, title and source fingerprint are mandatory.');
            }
            const id = String(input.id);
            if (seen.has(id))
                throw new ChangeResolutionError('DUPLICATE_ISSUE', `Duplicate issue: ${id}.`);
            seen.add(id);
            const old = existing.find(x => x.id === id);
            const normalized = {
                id,
                projectId,
                title: String(input.title),
                details: String(input.details || ''),
                severity: ['high', 'medium', 'low'].includes(input.severity) ? input.severity : 'medium',
                category: String(input.category || 'change'),
                affectedArtifacts: Array.isArray(input.affectedArtifacts) ? clone(input.affectedArtifacts) : [],
                sourceFingerprint: String(input.sourceFingerprint)
            };
            if (old && old.sourceFingerprint === normalized.sourceFingerprint && old.status !== 'superseded')
                continue;
            const value = {
                ...normalized,
                status: old?.status === 'applied' ? 'conflict' : 'detected',
                proposal: null,
                preview: null,
                approval: null,
                applied: null,
                instructions: '',
                revision: old ? old.revision + 1 : 1,
                history: [...(old?.history || []), { action: old ? 'source-changed' : 'detected', at: this.clock(), by: actor.id }]
            };
            await this.store.put(projectId, id, value, old?.revision ?? null);
        }
        for (const old of existing) {
            if (seen.has(old.id) || ['applied', 'rejected', 'superseded'].includes(old.status))
                continue;
            await this.store.put(projectId, old.id, {
                ...old,
                status: 'superseded',
                approval: null,
                revision: old.revision + 1,
                history: [...old.history, { action: 'superseded', by: actor.id, at: this.clock() }]
            }, old.revision);
        }
        return this.snapshot(projectId);
    }
    async get(projectId, issueId) {
        const issue = await this.store.get(projectId, issueId);
        if (!issue)
            throw new ChangeResolutionError('NOT_FOUND', 'Change issue not found.');
        return clone(issue);
    }
    async generate(projectId, issueId, actor, instructions = '') {
        const issue = await this.get(projectId, issueId);
        await this.gate('generate', projectId, actor, issue);
        if (issue.status === 'applied')
            throw new ChangeResolutionError('ALREADY_APPLIED', 'Applied issues cannot be regenerated.');
        const context = await this.workflow.context({ projectId, issue: clone(issue) });
        const expected = await this.workflow.fingerprint({ projectId, issue: clone(issue) });
        if (expected !== issue.sourceFingerprint)
            throw new ChangeResolutionError('STALE_SOURCE', 'Source changed; rerun impact analysis.');
        const result = validatePlan(await this.model.generate({ projectId, issue: clone(issue), context, instructions: String(instructions || '') }));
        const latest = await this.get(projectId, issueId);
        if (latest.revision !== issue.revision)
            throw new ChangeResolutionError('CONCURRENT_EDIT', 'Issue changed during AI generation.');
        const finalFingerprint = await this.workflow.fingerprint({ projectId, issue: clone(latest) });
        if (finalFingerprint !== issue.sourceFingerprint)
            throw new ChangeResolutionError('STALE_SOURCE', 'Source changed during AI generation.');
        const updated = {
            ...latest,
            status: 'draft',
            proposal: result,
            proposalHash: fingerprint(result),
            preview: null,
            approval: null,
            instructions: String(instructions || ''),
            revision: latest.revision + 1,
            history: [...latest.history, { action: issue.proposal ? 'regenerated' : 'generated', at: this.clock(), by: actor.id }]
        };
        await this.store.put(projectId, issueId, updated, latest.revision);
        return clone(updated);
    }
    async preview(projectId, issueId, actor) {
        const issue = await this.get(projectId, issueId);
        await this.gate('preview', projectId, actor, issue);
        if (!['draft', 'previewed', 'approved'].includes(issue.status) || !issue.proposal) {
            throw new ChangeResolutionError('PREVIEW_UNAVAILABLE', 'Generate a proposed resolution first.');
        }
        const current = await this.workflow.fingerprint({ projectId, issue: clone(issue) });
        if (current !== issue.sourceFingerprint)
            throw new ChangeResolutionError('STALE_SOURCE', 'Affected sources changed.');
        const details = await this.workflow.preview({ projectId, issue: clone(issue), plan: clone(issue.proposal) });
        const preview = { ...clone(details), proposalHash: issue.proposalHash, sourceFingerprint: current };
        const updated = {
            ...issue,
            status: issue.status === 'approved' ? 'approved' : 'previewed',
            preview,
            revision: issue.revision + 1,
            history: [...issue.history, { action: 'previewed', at: this.clock(), by: actor.id }]
        };
        await this.store.put(projectId, issueId, updated, issue.revision);
        return clone(updated);
    }
    async approve(projectId, issueId, actor) {
        const issue = await this.get(projectId, issueId);
        await this.gate('approve', projectId, actor, issue);
        if (issue.status !== 'previewed' || !issue.preview || issue.preview.proposalHash !== issue.proposalHash) {
            throw new ChangeResolutionError('PREVIEW_REQUIRED', 'Review the latest AI proposal before approval.');
        }
        const current = await this.workflow.fingerprint({ projectId, issue: clone(issue) });
        if (current !== issue.sourceFingerprint)
            throw new ChangeResolutionError('STALE_SOURCE', 'Cannot approve changes against outdated evidence.');
        const approval = { by: actor.id, at: this.clock(), proposalHash: issue.proposalHash, sourceFingerprint: current };
        const updated = {
            ...issue,
            status: 'approved',
            approval,
            revision: issue.revision + 1,
            history: [...issue.history, { action: 'approved', ...approval }]
        };
        await this.store.put(projectId, issueId, updated, issue.revision);
        return clone(updated);
    }
    async apply(projectId, issueId, actor) {
        const issue = await this.get(projectId, issueId);
        await this.gate('apply', projectId, actor, issue);
        if (issue.status === 'applied')
            return issue;
        if (issue.status !== 'approved' || !issue.approval || issue.approval.proposalHash !== issue.proposalHash) {
            throw new ChangeResolutionError('APPROVAL_REQUIRED', 'Approved, unchanged proposal required before applying.');
        }
        const current = await this.workflow.fingerprint({ projectId, issue: clone(issue) });
        if (current !== issue.sourceFingerprint) {
            const blocked = {
                ...issue,
                status: 'conflict',
                revision: issue.revision + 1,
                history: [...issue.history, { action: 'blocked-stale', by: actor.id, at: this.clock() }]
            };
            await this.store.put(projectId, issueId, blocked, issue.revision);
            throw new ChangeResolutionError('STALE_SOURCE', 'Source changed since approval. Changes were not applied.');
        }
        const idempotencyKey = fingerprint({ projectId, issueId, proposalHash: issue.proposalHash, approval: issue.approval });
        const receipt = await this.workflow.apply({
            projectId,
            issue: clone(issue),
            plan: clone(issue.proposal),
            approval: clone(issue.approval),
            expectedSourceFingerprint: current,
            idempotencyKey,
            publishExternally: false
        });
        if (!receipt || receipt.success !== true) {
            throw new ChangeResolutionError('APPLY_FAILED', 'Atomic apply was not confirmed; no completion was recorded.');
        }
        const latest = await this.get(projectId, issueId);
        if (latest.revision !== issue.revision) {
            throw new ChangeResolutionError('CONCURRENT_EDIT', 'Issue changed while applying. Reconcile the receipt using the idempotency key.');
        }
        const updated = {
            ...issue,
            status: 'applied',
            applied: { by: actor.id, at: this.clock(), idempotencyKey, receipt: clone(receipt) },
            revision: issue.revision + 1,
            history: [...issue.history, { action: 'applied', by: actor.id, at: this.clock(), idempotencyKey }]
        };
        await this.store.put(projectId, issueId, updated, issue.revision);
        return clone(updated);
    }
    async reject(projectId, issueId, actor, reason) {
        const issue = await this.get(projectId, issueId);
        await this.gate('reject', projectId, actor, issue);
        if (issue.status === 'applied')
            throw new ChangeResolutionError('ALREADY_APPLIED', 'Applied issues cannot be rejected.');
        const updated = {
            ...issue,
            status: 'rejected',
            approval: null,
            preview: null,
            revision: issue.revision + 1,
            history: [...issue.history, { action: 'rejected', by: actor.id, at: this.clock(), reason: String(reason || '') }]
        };
        await this.store.put(projectId, issueId, updated, issue.revision);
        return clone(updated);
    }
}
class InMemoryChangeStore {
    constructor(initial = {}) {
        this.data = clone(initial);
    }
    async list(projectId) {
        return Object.values(this.data[projectId] || {}).map(clone);
    }
    async get(projectId, issueId) {
        const issue = this.data[projectId]?.[issueId];
        return issue ? clone(issue) : null;
    }
    async put(projectId, issueId, value, expectedRevision) {
        this.data[projectId] ||= {};
        const old = this.data[projectId][issueId];
        if ((old?.revision ?? null) !== expectedRevision) {
            throw new ChangeResolutionError('CONCURRENT_EDIT', 'Revision mismatch.');
        }
        this.data[projectId][issueId] = clone(value);
    }
}
module.exports = { AIChangeResolutionService, InMemoryChangeStore, ChangeResolutionError, fingerprint, validatePlan };
