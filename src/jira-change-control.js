'use strict';
const crypto = require('node:crypto');
const { validIssueKey } = require('./remote-actions');
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const STARTED = /(?:^|\b)(?:in progress|in development|development|implementing|review|testing|qa|uat|resolved|complete|completed|done|closed|deployed|blocked|ready for release)(?:\b|$)/i;
const TODO = /(?:^|\b)(?:to do|todo|open|backlog|selected for development|new|planned)(?:\b|$)/i;
function workHistory(issue, history) {
    const category = String(issue?.fields?.status?.statusCategory?.key || '').toLowerCase();
    if (!['new', 'indeterminate', 'done'].includes(category))
        return { known: false, started: true, reason: 'Jira status category could not be verified' };
    if (!history || history.complete !== true || !Array.isArray(history.entries))
        return { known: false, started: true, reason: 'Full Jira status history unavailable' };
    const status = String(issue?.fields?.status?.name || '');
    const events = history.entries.filter(item => String(item.fieldId || item.field || '').toLowerCase() === 'status');
    const started = category === 'indeterminate' || category === 'done' || STARTED.test(status) || events.some(item => STARTED.test(String(item.toString || '')) || STARTED.test(String(item.fromString || '')));
    const unknown = category === 'new' && !started && events.some(item => { const before = String(item.fromString || ''); const after = String(item.toString || ''); return [before, after].some(s => s && !STARTED.test(s) && !TODO.test(s)); });
    if (unknown)
        return { known: false, started: true, reason: 'Historic Jira status could not be classified' };
    return { known: true, started, reason: started ? 'Jira work has started (including historical transitions)' : 'Work has not started', status, checkedAt: new Date().toISOString() };
}
function binding(items) { return sha(items.map(x => [x.path, x.action, x.key || '', x.hash || '']).sort((a, b) => a[0].localeCompare(b[0]))); }
function relatedKeys(reg, item) {
    const matches = new Set();
    for (const [path, data] of Object.entries(reg.synced || {})) {
        if (!data?.key)
            continue;
        if (path === item.path || ((item.action === 'update' || item.action === 'retire') && path.startsWith(item.path + '/')) ||
            (item.action === 'create' && item.parent && (path === item.parent || item.parent.startsWith(path + '/'))))
            matches.add(validIssueKey(data.key));
    }
    return [...matches].sort();
}
function activeApproval(reg, item, planHash) { return (reg.changeRequests || []).find(cr => cr.state === 'approved' && cr.planHash === planHash && cr.actions?.some(x => x.path === item.path && x.action === item.action && x.hash === item.hash)) || null; }
async function assessPlan(reg, items, reader, { approvedPlan = items } = {}) {
    const planHash = binding(approvedPlan), cache = new Map(), protection = [];
    const approvedActions = new Set(approvedPlan.map(x => JSON.stringify([x.path, x.action, x.key || '', x.hash || ''])));
    for (const item of items) {
        const related = relatedKeys(reg, item), issues = [];
        for (const key of related) {
            if (!cache.has(key))
                cache.set(key, await reader(key));
            const state = cache.get(key);
            const prior = reg.jiraWorkHistory?.[key];
            issues.push({ key, ...state, started: !!(state.started || prior?.started), reason: prior?.started && !state.started ? 'Jira work was previously observed as started' : state.reason });
        }
        const started = issues.some(x => x.started || !x.known);
        const inPlan = approvedActions.has(JSON.stringify([item.path, item.action, item.key || '', item.hash || '']));
        const cr = started && inPlan ? activeApproval(reg, item, planHash) : null;
        const unverified = issues.some(x => !x.known);
        protection.push({ path: item.path, action: item.action, issues, started, crId: cr?.id || null, blocked: !inPlan || unverified || (started && !cr), reason: !inPlan ? 'Action is not in the approved full plan' : issues.find(x => x.started || !x.known)?.reason || '' });
    }
    return { planHash, protection, blocked: protection.filter(row => row.blocked), checkedAt: new Date().toISOString() };
}
function impactOf(reg, paths) {
    const brIds = [...new Set(paths.map(x => x.split('/')[0]))], nodes = new Set(paths), edges = reg.canonical?.edges || [];
    const linkedJira = Object.entries(reg.synced || {}).filter(([path, item]) => item?.key && brIds.includes(path.split('/')[0])).map(([path, item]) => ({ path, key: item.key }));
    const affectedSources = [...new Set(brIds.flatMap(id => (reg.brs || []).find(b => b.id === id)?.evidence?.map(x => x.name) || []))];
    const impactedRelations = edges.filter(e => nodes.has(e.from) || nodes.has(e.to)).slice(0, 150);
    return { brIds, paths, linkedJira, affectedSources, impactedRelations, downstreamKinds: ['Product & UI Design', 'User Experience Flows', 'Screen Mockups', 'Architecture Diagram', 'API Design', 'Database Design'], requiresReview: true };
}
module.exports = { workHistory, binding, relatedKeys, activeApproval, assessPlan, impactOf };
