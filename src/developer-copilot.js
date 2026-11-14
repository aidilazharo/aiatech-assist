'use strict';

const AREAS = Object.freeze(['Frontend', 'API / Backend', 'Database', 'Integration', 'Testing']);

function normalizeIssue(issue) {
  const f = issue && typeof issue === 'object' ? issue.fields || {} : {};
  const key = String(issue?.key || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/.test(key)) return null;
  const status = String(f.status?.name || 'Unknown');
  const category = String(f.status?.statusCategory?.key || '').toLowerCase();
  const priority = String(f.priority?.name || 'Not set');
  const dueDate = typeof f.duedate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.duedate) ? f.duedate : '';
  // A story-point value must be identified by field name; arbitrary numeric custom fields are not points.
  const points = typeof f.storyPoints === 'number' ? f.storyPoints : null;
  const sprint = typeof f.sprint?.name === 'string' ? f.sprint.name : '';
  return {
    key,
    summary: String(f.summary || '').slice(0, 300),
    description: String(issue.descriptionText || '').slice(0, 16000),
    priority,
    status,
    category,
    dueDate,
    points,
    sprint,
    updated: String(f.updated || ''),
    issueType: String(f.issuetype?.name || ''),
    assignee: String(f.assignee?.displayName || 'Unassigned'),
  };
}

function priorityRank(priority) {
  const name = String(priority || '').toLowerCase().trim();
  if (/^(highest|blocker|critical|p0|urgent)$/.test(name)) return 0;
  if (/^(high|p1|major)$/.test(name)) return 1;
  if (/^(medium|normal|p2)$/.test(name)) return 2;
  if (/^(low|minor|p3)$/.test(name)) return 3;
  if (/^(lowest|trivial|p4)$/.test(name)) return 4;
  return 5;
}
function sortIssues(issues) {
  return (Array.isArray(issues) ? issues : []).filter(Boolean).slice().sort((a,b)=>{
    const completed = item => item.category==='done' || /done|closed|resolved|complete/i.test(item.status);
    const aDone=Number(completed(a)), bDone=Number(completed(b));
    return aDone-bDone || priorityRank(a.priority)-priorityRank(b.priority) ||
      String(a.dueDate||'9999-12-31').localeCompare(String(b.dueDate||'9999-12-31')) ||
      String(a.key).localeCompare(String(b.key));
  });
}

function classifyPath(name) {
  const file = String(name || '').replace(/\\/g, '/').toLowerCase();
  if (!file || file.startsWith('/') || file.split('/').includes('..')) return null;
  if (/(^|\/)(__tests__|tests?|specs?|e2e|cypress|playwright)(\/|$)|(?:\.test|\.spec)\.[jt]sx?$|(^|\/)(jest|vitest|pytest|coverage)/.test(file)) return 'Testing';
  if (/(^|\/)(migrations?|schema|database|db)(\/|$)|\.(?:sql|prisma)$/.test(file)) return 'Database';
  if (/(^|\/)(integrations?|adapters?|webhooks?|connectors?)(\/|$)/.test(file)) return 'Integration';
  if (/(^|\/)(api|controllers?|services?|routes?|backend|server)(\/|$)|(?:^|\/)(?:api|server)\.[jt]s$/.test(file)) return 'API / Backend';
  if (/(^|\/)(frontend|ui|components?|pages?|screens?|hooks?|client|web|app)(\/|$)|\.[jt]sx$|\.(?:css|scss|html|vue|svelte)$/.test(file)) return 'Frontend';
  return null;
}

function artifactGroups(files = [], updated = '') {
  const categories = Object.fromEntries(AREAS.map(area => [area, {name:area,files:[],updated:updated||'',status:'No changes detected'}]));
  for (const entry of Array.isArray(files) ? files.slice(0, 250) : []) {
    const name = typeof entry === 'string' ? entry : entry?.path;
    const area = classifyPath(name);
    if (!area || categories[area].files.includes(name)) continue;
    categories[area].files.push(name);
    categories[area].status = 'Changes detected';
  }
  return AREAS.map(area => categories[area]);
}

function metrics(issues) {
  const rows = Array.isArray(issues) ? issues : [];
  const contains = (r, re) => re.test(r.status.toLowerCase());
  return {
    active: rows.filter(r => r.category !== 'done' && !contains(r,/closed|resolved|done|complete/)).length,
    review: rows.filter(r => contains(r,/review|approval|qa/)).length,
    blocked: rows.filter(r => contains(r,/block|impediment|on hold/)).length,
    completed: rows.filter(r => r.category === 'done' || contains(r,/closed|resolved|done|complete/)).length,
  };
}

function risk(issues) {
  if (!issues) return {label:'Not assessed',reason:'Select a Jira issue to analyze risk.'};
  if (/block|impediment|on hold/i.test(issues.status)) return {label:'Attention',reason:'Jira status indicates a blocker.'};
  if (issues.dueDate && issues.category !== 'done' && Date.parse(issues.dueDate+'T23:59:59Z') < Date.now()) return {label:'Attention',reason:'Jira due date has passed.'};
  return {label:'Not assessed',reason:'Run AI analysis for a contextual assessment.'};
}

function nextAction(issue, {branch = '', testPassed = false, prKnown = false} = {}) {
  if (!issue) return 'Select a Jira task to begin.';
  if (!branch) return 'Connect the repository and create or resume the Jira-linked development branch.';
  if (!testPassed) return 'Run unit tests for the selected Jira branch and review their results.';
  if (!prKnown) return 'Review your code and create or open the draft pull request.';
  return 'Review browser-test evidence, pull-request approval and Jira completion criteria.';
}

module.exports = {AREAS,normalizeIssue,priorityRank,sortIssues,classifyPath,artifactGroups,metrics,risk,nextAction};
