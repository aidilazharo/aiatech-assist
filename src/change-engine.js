'use strict';
const crypto = require('node:crypto');
const sha = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const text = x => String(x ?? '').trim();
const content = x => ({ title: x.title, objective: x.objective, scope: x.scope, acceptanceCriteria: x.acceptanceCriteria, features: x.features });
const QUESTION_KEYS = ['problem', 'stakeholders', 'currentProcess', 'targetProcess', 'scope', 'businessRules', 'acceptance', 'data', 'dependencies', 'constraints', 'measures', 'questions'];
function graph(reg) {
    const records = [], edges = [];
    const sources = reg.sourceDocuments || [];
    for (const source of sources)
        records.push({ id: 'SOURCE:' + source.digest, type: 'source', title: source.name, hash: source.digest, uploadedBy: source.uploadedBy, uploadedAt: source.uploadedAt });
    if (reg.discoveryRevision) {
        records.push({ id: 'DISCOVERY:' + reg.discoveryRevision, type: 'discovery', title: '12 discovery questions', hash: reg.discoveryRevision });
        for (const key of QUESTION_KEYS) {
            const answer = text(reg.discoveryAnswers?.[key]);
            const id = 'QUESTION:' + key;
            records.push({ id, type: 'question', title: key, hash: sha(answer), answer });
            edges.push({ from: 'DISCOVERY:' + reg.discoveryRevision, to: id, relation: 'contains-question' });
        }
    }
    if (reg.reviewRevision)
        records.push({ id: 'AI-REVIEW:' + reg.reviewRevision, type: 'review', title: 'AI Review & Suggestions', hash: sha(reg.reviewText || '') });
    const sourceIds = new Set(sources.map(x => x.digest));
    for (const b of reg.brs || []) {
        const id = b.id;
        records.push({ id, type: 'br', title: b.title, hash: sha(content(b)), approvedHash: b.approvedContent ? sha(b.approvedContent) : null, revision: b.approvedRevision || 0, status: b.status, needsRefresh: !!b.needsRefresh, fields: { title: b.title, objective: b.objective, scope: b.scope, acceptanceCriteria: b.acceptanceCriteria } });
        if (reg.discoveryRevision)
            edges.push({ from: 'DISCOVERY:' + reg.discoveryRevision, to: id, relation: 'proposed-from' });
        for (const entry of b.evidence || []) {
            if (!entry.verified || !sourceIds.has(entry.digest) || !entry.passage)
                continue;
            const evidenceId = 'EVIDENCE:' + sha([id, entry.digest, entry.passage]);
            records.push({ id: evidenceId, type: 'evidence', title: entry.name || 'Source excerpt', hash: sha(entry.passage), passage: entry.passage, sourceDigest: entry.digest, passageIndex: entry.passageIndex });
            edges.push({ from: 'SOURCE:' + entry.digest, to: evidenceId, relation: 'contains-evidence' });
            edges.push({ from: evidenceId, to: id, relation: 'supports' });
        }
        for (const key of b.questionRefs || []) {
            if (QUESTION_KEYS.includes(key) && reg.discoveryRevision)
                edges.push({ from: 'QUESTION:' + key, to: id, relation: 'supports-question' });
        }
        if (reg.reviewRevision)
            edges.push({ from: 'AI-REVIEW:' + reg.reviewRevision, to: id, relation: 'review-context' });
        for (const f of b.features || []) {
            const fid = id + '/' + f.id;
            records.push({ id: fid, type: 'feature', title: f.title, hash: sha({ title: f.title, description: f.description }) });
            edges.push({ from: id, to: fid, relation: 'contains' });
            for (const s of f.stories || []) {
                const sid = fid + '/' + s.id;
                records.push({ id: sid, type: 'story', title: s.title, hash: sha({ title: s.title, description: s.description }) });
                edges.push({ from: fid, to: sid, relation: 'contains' });
                for (const task of s.tasks || []) {
                    const tid = sid + '/' + task.id;
                    records.push({ id: tid, type: 'task', title: task.title, hash: sha({ title: task.title, description: task.description }) });
                    edges.push({ from: sid, to: tid, relation: 'contains' });
                }
            }
        }
        for (const dep of b.dependencies || [])
            if ((reg.brs || []).some(x => x.id === dep) && dep !== id)
                edges.push({ from: dep, to: id, relation: 'depends-on' });
    }
    for (const cr of reg.changeRequests || []) {
        const id = 'CR:' + cr.id;
        records.push({ id, type: 'change-request', title: cr.id, hash: sha({ planHash: cr.planHash, state: cr.state, reason: cr.reason, approvedBy: cr.approveBy || null }), status: cr.state });
        for (const brId of cr.impact?.brIds || [])
            edges.push({ from: brId, to: id, relation: 'changed-under-request' });
        for (const linked of cr.impact?.linkedJira || [])
            if (linked.key)
                edges.push({ from: id, to: 'JIRA:' + linked.key, relation: 'authorizes-affected-issue' });
    }
    for (const [id, issue] of Object.entries(reg.synced || {}))
        if (issue?.key) {
            const jira = 'JIRA:' + issue.key;
            records.push({ id: jira, type: 'jira', title: issue.title || issue.key, hash: issue.hash || '', issueType: issue.issueType || issue.kind });
            edges.push({ from: id, to: jira, relation: 'published-as' });
        }
    return { schema: 2, at: new Date().toISOString(), records, edges };
}
function diff(a, b) {
    const old = new Map((a?.records || []).map(x => [x.id, x])), now = new Map((b?.records || []).map(x => [x.id, x]));
    const changes = [];
    for (const item of now.values()) {
        const previous = old.get(item.id);
        if (!previous)
            changes.push({ id: item.id, type: item.type, change: 'added', title: item.title, before: null, after: item.hash });
        else if (item.hash !== previous.hash || item.status !== previous.status || item.needsRefresh !== previous.needsRefresh)
            changes.push({ id: item.id, type: item.type, change: 'modified', title: item.title, before: previous.hash, after: item.hash, previousTitle: previous.title });
        else if (item.title !== previous.title)
            changes.push({ id: item.id, type: item.type, change: 'renamed', title: item.title, previousTitle: previous.title, before: previous.hash, after: item.hash });
    }
    for (const item of old.values())
        if (!now.has(item.id))
            changes.push({ id: item.id, type: item.type, change: 'removed', title: item.title, before: item.hash, after: null });
    return changes;
}
function coverage(g) {
    const brs = g.records.filter(x => x.type === 'br');
    const missing = brs.filter(b => !g.edges.some(e => e.to === b.id && e.relation === 'supports')).map(x => x.id);
    const collisions = [];
    const titles = new Map();
    for (const b of brs) {
        const title = text(b.title).toLowerCase().replace(/\W+/g, ' ');
        if (titles.has(title))
            collisions.push([titles.get(title), b.id]);
        else
            titles.set(title, b.id);
    }
    return { brCount: brs.length, questionCount: g.records.filter(x => x.type === 'question').length, taskCount: g.records.filter(x => x.type === 'task').length, evidenceCount: g.records.filter(x => x.type === 'evidence').length, missingEvidence: missing, duplicateTitles: collisions };
}
function rebuild(register, previous) {
    const latest = graph(register), old = previous?.canonical?.records ? previous.canonical : null;
    const changes = diff(old, latest);
    const previousNodes = new Map((old?.records || []).map(x => [x.id, x])), nextNodes = new Map(latest.records.map(x => [x.id, x]));
    for (const item of changes)
        if (item.type === 'br') {
            const before = previousNodes.get(item.id)?.fields || {}, after = nextNodes.get(item.id)?.fields || {};
            item.fieldChanges = ['title', 'objective', 'scope', 'acceptanceCriteria'].filter(key => before[key] !== after[key]).map(key => ({ field: key, before: before[key] || '', after: after[key] || '' }));
            if (item.change === 'modified' && item.fieldChanges.length === 1 && item.fieldChanges[0].field === 'title')
                item.change = 'renamed';
        }
    register.canonical = latest;
    register.traceability = { ...(register.traceability || {}), lastChanges: changes.slice(-500), coverage: coverage(latest), updatedAt: latest.at };
    if (changes.length)
        register.changeHistory = [...(previous?.changeHistory || []), { at: latest.at, changes: changes.slice(-300) }].slice(-75);
    else
        register.changeHistory = previous?.changeHistory || [];
    return register;
}
function compareRequirements(previous, updated) {
    const fields = ['title', 'objective', 'scope', 'acceptanceCriteria'];
    const rows = [];
    for (const field of fields)
        if (text(previous?.[field]) !== text(updated?.[field]))
            rows.push({ field, before: previous?.[field] || '', after: updated?.[field] || '' });
    const old = new Map((previous?.features || []).map(x => [x.id, x]));
    const fresh = new Map((updated?.features || []).map(x => [x.id, x]));
    for (const [id, feature] of fresh) {
        const prior = old.get(id);
        if (!prior || sha(prior) !== sha(feature))
            rows.push({ field: 'Feature ' + id, before: prior?.title || '', after: feature.title });
    }
    for (const [id, feature] of old)
        if (!fresh.has(id))
            rows.push({ field: 'Removed feature ' + id, before: feature.title, after: '' });
    return rows;
}
module.exports = { QUESTION_KEYS, graph, diff, coverage, rebuild, compareRequirements };
