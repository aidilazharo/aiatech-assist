'use strict';
const { requestJson, baseAtlassian } = require('./clients');
const { sha, textFromAdf } = require('./utils');
const { validProjectKey, jiraReadIssue, jiraReadIssueChangelog } = require('./remote-actions');
function normalized(s) { return String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' '); }
function epicName(s) { return normalized(String(s || '').replace(/^br-\d+\s*[:—-]\s*/i, '')); }
function auth(config, token) { if (!token)
    throw Error('Jira token required.'); return { token, basicEmail: String(config.get('jira.email') || '').trim() }; }
function validIssueKey(s) { if (!/^[A-Z][A-Z0-9_]{1,20}-\d{1,12}$/.test(String(s || '')))
    throw Error('Invalid Jira key.'); return s; }
function sameIssue(a, b) { return normalized(a.fields?.summary) === normalized(b.fields?.summary) && normalized(textFromAdf(a.fields?.description)) === normalized(textFromAdf(b.fields?.description)); }
function summarize(rows, localLinkedKeys = []) {
    const issues = (rows || []).filter(i => i && i.key && i.fields);
    const map = new Map(issues.map(i => [i.key, i]));
    const root = (item) => { let n = item; const visited = new Set(); while (n?.fields?.parent?.key && map.has(n.fields.parent.key)) {
        if (visited.has(n.key))
            break;
        visited.add(n.key);
        n = map.get(n.fields.parent.key);
    } return n?.key || item.key; };
    const epics = issues.filter(i => normalized(i.fields?.issuetype?.name) === 'epic' && i.fields?.summary);
    const epicGroups = new Map();
    for (const epic of epics) {
        const group = epicName(epic.fields.summary);
        if (!epicGroups.has(group))
            epicGroups.set(group, []);
        epicGroups.get(group).push(epic);
    }
    const overlapping = [...epicGroups].filter(([, list]) => list.length > 1).map(([name, list]) => ({ name, epics: list.map(i => {
            const children = issues.filter(x => x.key !== i.key && root(x) === i.key);
            return { key: i.key, summary: i.fields.summary, descendants: children.length, status: i.fields.status?.name || '',
                children: children.slice(0, 60).map(x => ({ key: x.key, title: x.fields.summary || '', type: x.fields.issuetype?.name || '', status: x.fields.status?.name || '', parentKey: x.fields.parent?.key || null })),
                childrenTruncated: children.length > 60 };
        }) }));
    const byTitle = new Map();
    for (const item of issues) {
        const parent = item.fields.parent?.key || '';
        const key = [normalized(item.fields.issuetype?.name), parent, normalized(item.fields.summary)].join('|');
        if (!byTitle.has(key))
            byTitle.set(key, []);
        byTitle.get(key).push(item);
    }
    const locallyLinked = new Set(localLinkedKeys);
    const candidates = [];
    let reviewCount = 0;
    for (const list of byTitle.values()) {
        if (list.length < 2)
            continue;
        list.sort((a, b) => String(a.fields.created || '').localeCompare(String(b.fields.created || '')) || a.key.localeCompare(b.key));
        const keep = list[0];
        for (const item of list.slice(1)) {
            const exact = sameIssue(keep, item);
            const hasChildren = issues.some(x => x.fields.parent?.key === item.key);
            const status = normalized(item.fields.status?.name);
            const labels = Array.isArray(item.fields.labels) ? item.fields.labels : [];
            const mapped = locallyLinked.has(item.key);
            const safe = exact && !hasChildren && !mapped && !item.fields?.assignee?.accountId && status === 'to do' && !!labels.find(l => /^atgv-[a-f0-9]{24}$/.test(l));
            if (!safe)
                reviewCount++;
            candidates.push({ key: item.key, keepKey: keep.key, title: item.fields.summary, kind: item.fields.issuetype?.name || '', parentKey: item.fields.parent?.key || null, status: item.fields.status?.name || '', exact, linked: mapped, hasChildren, eligible: safe, reason: safe ? 'Exact unlinked To Do leaf; requires live verification and explicit confirmation' : mapped ? 'Tracked in the local Jira publication mapping' : hasChildren ? 'Has child Jira issues' : !exact ? 'Descriptions differ; requires human requirement comparison' : status !== 'to do' ? 'Work status is not To Do' : 'Insufficient trusted identity' });
        }
    }
    const markers = new Map();
    for (const item of issues) {
        for (const label of item.fields.labels || []) {
            if (!/^atgv-[a-f0-9]{24}$/.test(label))
                continue;
            if (!markers.has(label))
                markers.set(label, []);
            markers.get(label).push(item.key);
        }
    }
    return { total: issues.length, overlapping, markerCollisions: [...markers].filter(([, keys]) => keys.length > 1).map(([marker, keys]) => ({ marker, keys })), candidates, eligible: candidates.filter(x => x.eligible).length, reviewRequired: reviewCount, scannedAt: new Date().toISOString() };
}
function assessPublishPlan(rows, changes, synced = {}) {
    const issues = (rows || []).filter(x => x && x.key && x.fields);
    const existingByKey = new Map(issues.map(x => [x.key, x]));
    const matches = [];
    const seen = new Set();
    function record(item, existing, reason) {
        const key = item.path + '|' + existing.key;
        if (seen.has(key))
            return;
        seen.add(key);
        matches.push({ path: item.path, title: item.title, existingKey: existing.key, existingTitle: existing.fields.summary, reason });
    }
    const epicByName = new Map();
    for (const issue of issues) {
        if (normalized(issue.fields.issuetype?.name) !== 'epic')
            continue;
        const name = epicName(issue.fields.summary);
        if (!epicByName.has(name))
            epicByName.set(name, []);
        epicByName.get(name).push(issue);
    }
    const planned = Array.isArray(changes) ? changes : [];
    for (const item of planned) {
        if (!item?.path)
            continue;
        const isEpic = item.kind === 'Epic';
        if (isEpic) {
            const title = epicName(item.title);
            const currentKey = item.key || synced[item.path]?.key;
            const roots = epicByName.get(title) || [];
            if (item.action === 'create' || item.action === 'update') {
                for (const issue of roots) {
                    if (issue.key === currentKey)
                        continue;
                    record(item, issue, item.action === 'create' ? 'Matching Epic already exists; reconcile the Business Requirement identity before creating another hierarchy' : 'Overlapping Epic hierarchy exists; reconcile before updating this requirement');
                }
            }
        }
        if (item.action !== 'create' || isEpic)
            continue;
        const parentPath = item.parent;
        const parentKey = parentPath && synced[parentPath]?.key;
        if (!parentKey)
            continue;
        for (const existing of issues) {
            if (existing.fields.parent?.key !== parentKey)
                continue;
            if (normalized(existing.fields.summary) !== normalized(item.title))
                continue;
            const kind = normalized(existing.fields.issuetype?.name);
            const compatible = item.kind === 'Feature' ? ['feature', 'story'].includes(kind) : item.kind === 'Story' || item.kind === 'Task' ? ['subtask', 'sub task'].includes(kind) : kind === normalized(item.kind);
            if (!compatible)
                continue;
            record(item, existing, 'An issue with the same title and parent already exists; compare its requirement reference before publishing');
        }
    }
    return { safe: matches.length === 0, matches, checked: issues.length, planned: planned.length };
}
async function fetchProjectIssues(config, token, { max = 1000 } = {}) {
    const project = validProjectKey(config.get('jira.projectKey'));
    if (!Number.isInteger(max) || max < 1 || max > 1000)
        throw Error('Invalid scan limit.');
    const all = [], seenTokens = new Set();
    let tokenPage;
    // Jira can return short pages even when another page exists.
    for (let page = 0; page < max && all.length < max; page++) {
        const body = { jql: `project = ${project} ORDER BY created ASC`, maxResults: Math.min(100, max - all.length), fields: ['summary', 'description', 'labels', 'issuetype', 'parent', 'project', 'status', 'assignee', 'updated', 'created'] };
        if (tokenPage)
            body.nextPageToken = tokenPage;
        const reply = await requestJson(`${baseAtlassian(config)}/rest/api/3/search/jql`, { ...auth(config, token), method: 'POST', data: body });
        if (!Array.isArray(reply?.issues) || reply.issues.length > body.maxResults)
            throw Error('Jira search response is incomplete; the project issue scan could not be verified.');
        all.push(...reply.issues);
        if (reply.isLast === true || (!reply.nextPageToken && reply.isLast !== false))
            return all;
        tokenPage = reply.nextPageToken;
        if (typeof tokenPage !== 'string' || !tokenPage || seenTokens.has(tokenPage))
            throw Error('Jira search returned a missing or repeated pagination token.');
        seenTokens.add(tokenPage);
    }
    throw Error(`The Jira project scan did not finish within the ${max}-issue audit limit. Duplicate and link checks require a complete scan.`);
}
function snapshot(issue) { return sha(JSON.stringify({ summary: issue.fields?.summary, description: normalized(textFromAdf(issue.fields?.description)), parent: issue.fields?.parent?.key || null, status: issue.fields?.status?.name, labels: issue.fields?.labels, updated: issue.fields?.updated })); }
module.exports = { normalized, epicName, sameIssue, summarize, assessPublishPlan, fetchProjectIssues, snapshot };
