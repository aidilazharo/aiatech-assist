'use strict';
const crypto = require('node:crypto');
const { AIChangeResolutionService, ChangeResolutionError } = require('./service');
const digest = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clone = x => JSON.parse(JSON.stringify(x));
const supportedFields = new Set(['title', 'objective', 'scope', 'acceptanceCriteria', 'description']);
const permittedIssueTypes = new Set(['proposal', 'evidence', 'role', 'jira']);
function locate(register, path) {
    const tokens = String(path || '').split('/');
    if (tokens.length < 1 || tokens.length > 4 || !/^BR-\d+$/.test(tokens[0]))
        throw Error('Invalid Business Requirements artifact path.');
    const br = (register.brs || []).find(x => x.id === tokens[0] && x.status !== 'retired' && x.status !== 'retire-proposed');
    if (!br)
        throw Error('Business Requirements artifact not found.');
    let node = br;
    const [feature, story, task] = tokens.slice(1);
    if (feature)
        node = (node.features || []).find(x => x.id === feature);
    if (story)
        node = (node?.stories || []).find(x => x.id === story);
    if (task)
        node = (node?.tasks || []).find(x => x.id === task);
    if (!node)
        throw Error('Business Requirements child artifact not found.');
    return { node, br, path: tokens.join('/'), kind: tokens.length === 1 ? 'br' : 'child' };
}
function sourceFor(register, id) {
    const [prefix, ...parts] = String(id || '').split(':');
    const sourceId = parts.join(':');
    if (!permittedIssueTypes.has(prefix) || !sourceId)
        return null;
    if (prefix === 'proposal')
        return (register.changeQueue || []).find(x => x.id === sourceId && x.status === 'pending') || null;
    if (prefix === 'evidence')
        return (register.sourceConflicts || []).find(x => x.id === sourceId && !register.sourceConflictDecisions?.[x.id]) || null;
    if (prefix === 'role')
        return (register.roleImpacts || []).find(x => x.id === sourceId && x.status === 'pending') || null;
    return (register.inboundJira || []).find(x => x.id === sourceId && x.status === 'pending') || null;
}
function pathsFor(register, id) {
    const item = sourceFor(register, id);
    if (!item)
        return [];
    if (id.startsWith('proposal:')) {
        if (item.origin === 'discovery') {
            const scope = require('../br-workflow').discoveryTargetScope(register, { key: item.sourceId });
            if (scope.targets.length !== 1 || item.targetIds?.length !== 1 || scope.targets[0] !== item.targetIds[0])
                return [];
        }
        return (item.targetIds || []).filter(p => { try {
            locate(register, p);
            return true;
        }
        catch {
            return false;
        } });
    }
    const root = String(item.brId || item.path || '').split('/')[0];
    try {
        locate(register, root);
        return [root];
    }
    catch {
        return [];
    }
}
function sourceFingerprint(register, id) {
    const item = sourceFor(register, id);
    if (!item)
        return null;
    const paths = pathsFor(register, id);
    if (!paths.length)
        return null;
    return digest({ type: id.split(':')[0], item, paths: paths.map(p => ({ path: p, node: locate(register, p).node })), importDigest: register.importDigest, discoveryRevision: register.discoveryRevision });
}
function collectFindings(register) {
    const items = [];
    const add = (type, id, title, details, severity = 'medium') => {
        const caseId = type + ':' + id, sourceFingerprintValue = sourceFingerprint(register, caseId);
        if (!sourceFingerprintValue)
            return;
        items.push({ id: caseId, title: String(title).slice(0, 180), details: String(details || '').slice(0, 2500), category: type, severity, affectedArtifacts: pathsFor(register, caseId), sourceFingerprint: sourceFingerprintValue });
    };
    for (const q of register.changeQueue || [])
        if (q.status === 'pending')
            add('proposal', q.id, 'Requirement change · ' + q.targetIds?.join(', '), `Proposed ${q.field} from ${q.origin}: ${q.value}`, 'medium');
    for (const q of register.sourceConflicts || [])
        if (!register.sourceConflictDecisions?.[q.id])
            add('evidence', q.id, 'Cross-document evidence conflict · ' + q.brId, `Source A: ${q.excerptA}\nSource B: ${q.excerptB}`, 'high');
    for (const q of register.roleImpacts || [])
        if (q.status === 'pending')
            add('role', q.id, 'Downstream role change · ' + q.brId, `Role ${q.roleId} / ${q.taskId}: ${q.excerpt}`);
    for (const q of register.inboundJira || [])
        if (q.status === 'pending')
            add('jira', q.id, 'External Jira change · ' + (q.path || q.key), `Jira ${q.key || ''}: ${q.description || q.summary || ''}`, 'high');
    return items.slice(0, 120);
}
function safePlan(register, issue, plan) {
    if (plan?.noChangesRequired === true && Array.isArray(plan.changes) && plan.changes.length === 0)
        throw new ChangeResolutionError('NO_CHANGES', 'AI found no evidence-supported editable changes. Review the source and reject this issue if it is no longer applicable.');
    if (!plan || !Array.isArray(plan.changes) || plan.changes.length > 8 || !plan.changes.length)
        throw new ChangeResolutionError('INVALID_PLAN', 'AI must return 1–8 evidence-supported field updates for the selected BR only. No changes were saved.');
    const paths = pathsFor(register, issue.id);
    if (!paths.length)
        throw Error('Business Requirements target is unavailable.');
    const records = [];
    for (const entry of plan.changes) {
        if (entry.operation !== 'update')
            throw Error('AI cannot create, delete or directly publish artifacts in Change Resolution.');
        if (!paths.includes(entry.artifactId))
            throw Error('AI selected an artifact outside the issue scope.');
        const field = entry.field;
        const record = locate(register, entry.artifactId);
        if (!supportedFields.has(field) || (record.kind === 'br' && field === 'description') || (record.kind === 'child' && !['title', 'description'].includes(field)))
            throw Error('AI selected an unsupported field.');
        const content = String(entry.proposedContent || '').trim();
        if (!content || content.length > (field === 'title' ? 180 : 5000))
            throw Error('AI content is empty or exceeds the field limit.');
        const expectedVersion = digest(record.node);
        if (entry.expectedVersion !== expectedVersion)
            throw Error('AI plan refers to an out-of-date requirement field.');
        records.push({ artifactId: entry.artifactId, operation: 'update', field, proposedContent: content, expectedVersion, reason: String(entry.reason || 'AI suggested correction').slice(0, 500) });
    }
    if (new Set(records.map(x => x.artifactId + '|' + x.field)).size !== records.length)
        throw Error('AI plan contains duplicate edits.');
    return { summary: String(plan.summary || 'AI resolution').slice(0, 1200), rationale: String(plan.rationale || '').slice(0, 3000), risk: String(plan.risk || 'Review required').slice(0, 1200), changes: records, dependencies: Array.isArray(plan.dependencies) ? plan.dependencies.slice(0, 25).map(v => String(v).slice(0, 160)) : [] };
}
function createAdapter({ registry, brWorkflow, generateModel, authorize }) {
    if (!registry || !brWorkflow || typeof generateModel !== 'function' || typeof authorize !== 'function')
        throw Error('Missing ATGV AI Change Resolution adapters.');
    const store = {
        async list(projectId) { return Object.values((await brWorkflow.load(registry, projectId)).aiChangeResolutions || {}).map(clone); },
        async get(projectId, issueId) { const r = await brWorkflow.load(registry, projectId); return clone(r.aiChangeResolutions?.[issueId] || null); },
        async put(projectId, issueId, value, expectedRevision) {
            const register = await brWorkflow.load(registry, projectId);
            await brWorkflow.write(registry, projectId, register.revision, next => {
                next.aiChangeResolutions ||= {};
                const old = next.aiChangeResolutions[issueId];
                if ((old?.revision ?? null) !== expectedRevision)
                    throw new ChangeResolutionError('CONCURRENT_EDIT', 'Resolution updated by another user. Refresh and retry.');
                next.aiChangeResolutions[issueId] = clone(value);
                const keys = Object.keys(next.aiChangeResolutions);
                if (keys.length > 300)
                    for (const key of keys.slice(0, keys.length - 300))
                        if (['applied', 'superseded', 'rejected'].includes(next.aiChangeResolutions[key].status))
                            delete next.aiChangeResolutions[key];
            });
        }
    };
    const workflow = {
        async context({ projectId, issue }) {
            const r = await brWorkflow.load(registry, projectId);
            const source = sourceFor(r, issue.id);
            const targets = pathsFor(r, issue.id).map(id => ({ artifactId: id, kind: locate(r, id).kind, content: clone(locate(r, id).node), expectedVersion: digest(locate(r, id).node) }));
            if (!source || !targets.length)
                throw Error('Unresolved issue changed. Refresh the issue list.');
            return { issue: clone(issue), source: clone(source), targets, discoveryAnswers: r.discoveryAnswers, linkedJira: Object.entries(r.synced || {}).filter(([p]) => targets.some(t => p === t.artifactId || p.startsWith(t.artifactId + '/'))).map(([p, x]) => ({ path: p, key: x.key })), approvedRequirementsProtected: true };
        },
        async fingerprint({ projectId, issue }) { const fp = sourceFingerprint(await brWorkflow.load(registry, projectId), issue.id); return fp || ''; },
        async preview({ projectId, issue, plan }) {
            const register = await brWorkflow.load(registry, projectId);
            const clean = safePlan(register, issue, plan);
            return { summary: clean.summary, diff: clean.changes.map(x => ({ artifactId: x.artifactId, field: x.field, before: String(locate(register, x.artifactId).node[x.field] || ''), after: x.proposedContent, reason: x.reason })), impactedJira: Object.entries(register.synced || {}).filter(([path]) => clean.changes.some(x => path === x.artifactId || path.startsWith(x.artifactId + '/'))).map(([, v]) => v.key).filter(Boolean), publication: 'Jira publication requires a separately approved Jira Preview' };
        },
        async apply({ projectId, issue, plan, approval, expectedSourceFingerprint, idempotencyKey, publishExternally }) {
            if (publishExternally !== false)
                throw Error('Change resolution cannot publish to external services.');
            const current = await brWorkflow.load(registry, projectId);
            if (current.aiChangeApplyReceipts?.[idempotencyKey])
                return current.aiChangeApplyReceipts[idempotencyKey];
            if (sourceFingerprint(current, issue.id) !== expectedSourceFingerprint)
                throw new ChangeResolutionError('STALE_SOURCE', 'Affected artifacts changed since approval.');
            const clean = safePlan(current, issue, plan);
            const updated = await brWorkflow.write(registry, projectId, current.revision, next => {
                next.aiChangeApplyReceipts ||= {};
                if (next.aiChangeApplyReceipts[idempotencyKey])
                    return;
                if (sourceFingerprint(next, issue.id) !== expectedSourceFingerprint)
                    throw new ChangeResolutionError('STALE_SOURCE', 'Affected artifacts changed while applying.');
                const touched = new Set();
                for (const change of clean.changes) {
                    const record = locate(next, change.artifactId);
                    if (digest(record.node) !== change.expectedVersion)
                        throw new ChangeResolutionError('STALE_SOURCE', 'The targeted Business Requirement changed.');
                    record.node[change.field] = change.proposedContent;
                    const br = record.br;
                    if (br.status === 'approved') {
                        br.status = 'draft';
                        br.draftSavedAt = null;
                    }
                    br.businessApproval = null;
                    br.needsRefresh = true;
                    br.staleReason = 'AI resolution applied; re-review and approve';
                    br.modifiedEpoch = next.importEpoch;
                    br.draftSource = { digest: next.importDigest, discoveryRevision: next.discoveryRevision, epoch: next.importEpoch };
                    const impact = (next.impact || []).find(x => x.id === br.id);
                    if (impact) {
                        impact.change = 'modified';
                        impact.approved = false;
                    }
                    touched.add(br.id);
                }
                const source = sourceFor(next, issue.id);
                if (!source)
                    throw new ChangeResolutionError('STALE_SOURCE', 'Issue is no longer pending.');
                const by = String(approval.by).slice(0, 120), at = new Date().toISOString();
                if (issue.id.startsWith('proposal:')) {
                    source.status = 'accepted';
                    source.decidedAt = at;
                    source.decidedBy = by;
                    next.changeDecisions = (next.changeDecisions || []).concat({ id: source.id, decision: 'accept', actor: by, at, aiResolution: issue.id }).slice(-250);
                }
                else if (issue.id.startsWith('evidence:')) {
                    next.sourceConflictDecisions ||= {};
                    next.sourceConflictDecisions[source.id] = true;
                }
                else if (issue.id.startsWith('role:')) {
                    source.status = 'reviewed';
                    source.reviewedAt = at;
                    source.reviewedBy = by;
                    const br = next.brs.find(x => x.id === source.brId);
                    if (br)
                        br.roleReviewRequired = (next.roleImpacts || []).some(x => x.brId === br.id && x.status === 'pending');
                }
                else if (issue.id.startsWith('jira:')) {
                    source.status = 'reviewed';
                    source.reviewedAt = at;
                    source.reviewedBy = by;
                }
                next.retirementApprovals = {};
                next.events = (next.events || []).concat({ at, action: 'ai-change-resolution-applied', by, issueId: issue.id, changedBusinessRequirements: [...touched], idempotencyKey }).slice(-200);
                next.aiChangeApplyReceipts[idempotencyKey] = { success: true, issueId: issue.id, updatedBusinessRequirements: [...touched], draftsOnly: true, publishedToJira: false, idempotencyKey };
                if (Object.keys(next.aiChangeApplyReceipts).length > 250)
                    for (const key of Object.keys(next.aiChangeApplyReceipts).slice(0, -250))
                        delete next.aiChangeApplyReceipts[key];
            });
            return updated.aiChangeApplyReceipts[idempotencyKey];
        }
    };
    const model = { generate: async ({ projectId, issue, context, instructions }) => {
            const r = await brWorkflow.load(registry, projectId);
            if (pathsFor(r, issue.id).length !== 1)
                throw new ChangeResolutionError('TARGET_RECONCILIATION_REQUIRED', 'Select and verify one authoritative Business Requirement before generating a change plan. No changes were saved.');
            let lastError;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const promptInstructions = attempt === 0 ? instructions : [instructions, 'Previous AI response failed validation: ' + lastError.message, 'Return valid JSON with 1–8 real updates; use an exact provided artifactId and expectedVersion. If no edit is justified return {"noChangesRequired":true,"changes":[],"rationale":"..."}. Never target another BR.'].filter(Boolean).join('\n\n');
                    const raw = await generateModel({ projectId, issue, context, instructions: promptInstructions });
                    return safePlan(r, issue, raw);
                }
                catch (error) {
                    const retryable = error instanceof SyntaxError || error.code === 'INVALID_PLAN' || /^(AI plan |AI selected |AI content |AI cannot |AI Change Resolution returned invalid JSON)/.test(String(error.message || ''));
                    if (!retryable)
                        throw error;
                    lastError = error;
                }
            }
            throw new ChangeResolutionError('INVALID_PLAN', 'The AI returned an invalid change plan after retry: ' + String(lastError?.message || 'Unknown validation failure') + '. No changes were applied.');
        } };
    return { service: new AIChangeResolutionService({ store, workflow, model, authorize }), collectFindings: async (projectId) => collectFindings(await brWorkflow.load(registry, projectId)), store, workflow };
}
module.exports = { locate, pathsFor, sourceFor, sourceFingerprint, collectFindings, safePlan, createAdapter };
