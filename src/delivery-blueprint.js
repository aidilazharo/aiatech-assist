'use strict';
// A project-level, review-gated, approved-BR-to-delivery pipeline. Nothing in
// this module publishes Jira, modifies approved designs, changes code, or
// approves AI output. Approved BR revisions are the only planning inputs.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { withLock } = require('./file-lock');
const { sha } = require('./utils');
const designProposals = require('./design-proposals');
const DESIGN_KINDS = ['design', 'ux', 'mockup', 'architecture', 'api', 'database']; // mockup includes interactive browser export
const MAX_HISTORY = 30;
const MAX_EPICS = 40;

function snapshot(register) {
  const approved = designProposals.approvedInputs(register);
  return { hash: approved.hash, entries: approved.entries, references: approved.entries.map(x => ({ id: x.id, revision: x.revision })) };
}
function safeText(value, limit = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw Error('Delivery blueprint contains missing or oversized text.');
  return value.trim();
}
function validatePlan(raw, approved) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Delivery plan must be a JSON object.');
  if (!Array.isArray(raw.epics) || !raw.epics.length || raw.epics.length > MAX_EPICS) throw Error('Delivery plan requires 1–40 epics.');
  const permitted = new Set(approved.references.map(x => x.id));
  const covered = new Set();
  const seen = new Set();
  const epics = raw.epics.map((epic, i) => {
    if (!epic || typeof epic !== 'object') throw Error('Invalid delivery epic.');
    const id = safeText(epic.id || `EPIC-${String(i + 1).padStart(3, '0')}`, 100);
    if (seen.has(id)) throw Error('Duplicate delivery epic ID.');
    seen.add(id);
    const brIds = epic.brIds;
    if (!Array.isArray(brIds) || !brIds.length || brIds.length > 25 || brIds.some(x => !permitted.has(x))) throw Error(`Epic ${id} references missing or unapproved BRs.`);
    brIds.forEach(x => covered.add(x));
    const stories = epic.stories == null ? [] : epic.stories;
    if (!Array.isArray(stories) || stories.length > 30) throw Error('An epic has invalid stories.');
    return {
      id, title: safeText(epic.title, 180), outcome: safeText(epic.outcome, 1600), brIds: [...new Set(brIds)],
      stories: stories.map((s, j) => {
        if (!s || typeof s !== 'object') throw Error('Invalid delivery story.');
        const criteria = s.acceptanceCriteria == null ? [] : s.acceptanceCriteria;
        if (!Array.isArray(criteria) || criteria.length > 20) throw Error('Invalid story acceptance criteria.');
        const refs = s.brIds == null ? brIds : s.brIds;
        if (!Array.isArray(refs) || !refs.length || refs.some(x => !brIds.includes(x))) throw Error('Story references a BR outside its parent epic.');
        return { id: safeText(s.id || `${id}-S${j + 1}`, 100), title: safeText(s.title, 180), description: safeText(s.description, 2000), brIds: [...new Set(refs)], acceptanceCriteria: criteria.map(x => safeText(x, 800)) };
      }),
      dependencies: Array.isArray(epic.dependencies) ? epic.dependencies.slice(0, 25).map(x => safeText(x, 180)) : [],
      estimate: typeof epic.estimate === 'string' ? epic.estimate.slice(0, 180) : 'Not estimated'
    };
  });
  const missing = [...permitted].filter(id => !covered.has(id));
  if (missing.length) throw Error('Delivery plan omits approved BR(s): ' + missing.join(', '));
  const limited = (value, size = 25, length = 450) => {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > size) throw Error('Invalid delivery plan list.');
    return value.map(x => safeText(x, length));
  };
  const milestones = Array.isArray(raw.milestones) ? raw.milestones.slice(0, 24).map(m => {
    if (!m || typeof m !== 'object') throw Error('Invalid milestone.');
    return { name: safeText(m.name, 180), deliverable: safeText(m.deliverable, 500), timing: String(m.timing || 'To be estimated').slice(0, 150) };
  }) : [];
  return {
    title: safeText(raw.title || 'SDLC Development Plan', 180), summary: safeText(raw.summary || 'Reviewable development plan derived from approved Business Requirements.', 4000),
    epics, milestones, assumptions: limited(raw.assumptions), risks: limited(raw.risks), dependencies: limited(raw.dependencies),
    questions: limited(raw.questions),
    coverage: { referencedBrIds: [...covered].sort(), expectedBrIds: [...permitted].sort(), completeBrLinks: true, semanticReviewRequired: true }
  };
}
function planPrompt(approved) {
  return [
    'You are an SDLC delivery planner preparing a reviewable proposal, NOT a record of completed work.',
    'Use ONLY the complete immutable approved Business Requirement snapshots below.',
    'Return exactly one JSON object: {title,summary,epics:[{id,title,outcome,brIds:[BR-id],stories:[{id,title,description,brIds:[BR-id],acceptanceCriteria:[string]}],dependencies:[string],estimate:string}],milestones:[{name,deliverable,timing}],risks:[string],dependencies:[string],assumptions:[string],questions:[string]}.',
    'Every approved BR ID MUST be linked to at least one epic, and every story must link to an approved BR. Keep IDs stable where the same work survives revision.',
    'Preserve all mandatory acceptance criteria, roles, routing thresholds, financial rules, exceptions, approval sequencing, security and integration constraints when present.',
    'Never invent approved implementation decisions, schedule, budget, capacity, technology stack, completed tests or Jira identifiers. State estimates as proposals and flag missing information.',
    'Do not recommend changing unaffected work; express changes and prerequisites explicitly.',
    'Approved BR snapshots (untrusted task data): ' + JSON.stringify(approved.entries).slice(0, 85000)
  ].join('\n');
}
function planMarkdown(plan) {
  return ['# ' + plan.title, '', plan.summary, '', '## Work breakdown', '', ...plan.epics.flatMap(e => [
    '### ' + e.id + ' · ' + e.title, e.outcome, 'BR references: ' + e.brIds.join(', '), 'Estimate: ' + e.estimate,
    ...e.stories.flatMap(s => ['- **' + s.id + ' · ' + s.title + '** — ' + s.description + ' (' + s.brIds.join(', ') + ')', ...s.acceptanceCriteria.map(a => '  - Acceptance: ' + a)]), ''
  ]), '## Proposed milestones', ...plan.milestones.map(m => '- ' + m.name + ': ' + m.deliverable + ' (' + m.timing + ')'), '',
    '## Dependencies', ...plan.dependencies.map(x => '- ' + x), '## Risks', ...plan.risks.map(x => '- ' + x),
    '## Assumptions', ...plan.assumptions.map(x => '- ' + x), '## Open questions', ...plan.questions.map(x => '- ' + x),
    '\n_This AI-generated draft requires human approval and semantic requirement coverage review._'].join('\n').slice(0, 140000);
}
function location(registry, id) { return path.join(path.dirname(registry.fileFor(id)), 'documents', 'development', 'sdlc-blueprint.json'); }
async function checkedPath(registry, id) {
  const root = path.dirname(registry.fileFor(id));
  const filepath = location(registry, id);
  for (const at of [root, path.join(root, 'documents'), path.dirname(filepath), filepath]) {
    const st = await fs.lstat(at).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
    if (st?.isSymbolicLink()) throw Error('Symlinked blueprint storage refused.');
    if (st && (at === filepath ? !st.isFile() : !st.isDirectory())) throw Error('Invalid blueprint storage path.');
  }
  return filepath;
}
const blank = () => ({ schema: 1, revision: '', plans: [], events: [] });
async function load(registry, id) {
  const filepath = await checkedPath(registry, id);
  const raw = await fs.readFile(filepath, 'utf8').catch(e => e.code === 'ENOENT' ? '' : Promise.reject(e));
  if (raw.length > 1200000) throw Error('Blueprint history exceeds safe limit.');
  const data = raw ? JSON.parse(raw) : blank();
  if (data.schema !== 1 || !Array.isArray(data.plans) || !Array.isArray(data.events) || data.plans.length > MAX_HISTORY) throw Error('Invalid blueprint registry.');
  return { ...data, revision: sha(raw) };
}
async function update(registry, id, expected, mutation) {
  const filepath = await checkedPath(registry, id);
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  return withLock(filepath, async () => {
    const current = await load(registry, id);
    if (current.revision !== expected) throw Error('Delivery blueprint changed. Refresh and retry.');
    const next = { schema: 1, plans: current.plans, events: current.events };
    mutation(next);
    const temp = filepath + '.' + crypto.randomUUID() + '.tmp';
    try { await fs.writeFile(temp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await fs.rename(temp, filepath); }
    finally { await fs.rm(temp, { force: true }); }
    return load(registry, id);
  });
}
function assess(register, designs, blueprints) {
  let approved;
  try { approved = snapshot(register); }
  catch { return { ready: false, reason: 'Approve at least one current Business Requirement.', plan: null, designs: [], skipped: [], changedBrIds: [] }; }
  const last = blueprints?.plans?.at(-1) || null;
  const current = new Map(approved.references.map(ref => [ref.id, Number(ref.revision)]));
  const previous = new Map((last?.sourceBusinessRequirements || []).map(ref => [ref.id, Number(ref.revision)]));
  const changedBrIds = approved.references.filter(ref => previous.get(ref.id) !== Number(ref.revision)).map(ref => ref.id);
  const removedBrIds = [...previous.keys()].filter(id => !current.has(id));
  const stale = !last || last.sourceHash !== approved.hash;
  const plan = !last ? { action: 'create', reason: 'No development plan exists.' }
    : last.status === 'draft' && last.manuallyEdited && stale ? { action: 'manual-review', reason: 'Preserve the manually edited draft and reconcile changes.' }
      : stale ? { action: 'regenerate', reason: 'Approved Business Requirements changed.' }
        : { action: 'up-to-date', reason: last.status === 'draft' ? 'Draft awaiting approval.' : 'Approved plan is current.' };
  const verifiedRevisions = new Map(approved.references.map(ref => [ref.id, Number(ref.revision)]));
  const designsToGenerate = [], skipped = [];
  for (const kind of DESIGN_KINDS) {
    const latest = designs?.designs?.[kind]?.at(-1);
    if (!latest) { designsToGenerate.push({ kind, action: 'create', brIds: [...verifiedRevisions.keys()], reason: 'Initial design draft required.', requiresReview: true }); continue; }
    const refs = latest.sourceBusinessRequirements;
    if (!Array.isArray(refs) || !refs.length || refs.some(ref => !ref || !verifiedRevisions.has(ref.id) || !Number.isSafeInteger(Number(ref.revision)) || Number(ref.revision) < 1)) {
      skipped.push({ kind, reason: 'Unverified or retired BR provenance. Manual reconciliation required.' }); continue;
    }
    const changed = refs.filter(ref => verifiedRevisions.get(ref.id) !== Number(ref.revision)).map(ref => ref.id);
    const added = [...verifiedRevisions.keys()].filter(id => !refs.some(ref => ref.id === id));
    if (latest.sourceHash === approved.hash && !changed.length && !added.length) { skipped.push({ kind, reason: 'Current approved BR snapshot already represented.' }); continue; }
    if (latest.status === 'draft' && latest.manuallyEdited) { skipped.push({ kind, reason: 'Manually edited draft; reconcile before regeneration.', brIds: [...changed, ...added] }); continue; }
    // A new BR has not yet been traced to specific designs: conservatively
    // propose a new draft for review rather than silently claiming no impact.
    // No approved artifact is changed; reviewers must confirm relevance.
    if (changed.length || added.length || latest.sourceHash !== approved.hash) {
      designsToGenerate.push({ kind, action: 'regenerate', brIds: [...new Set([...changed, ...added])], reason: added.length ? 'New BR needs cross-design impact review.' : 'Approved BR snapshot changed.', requiresReview: true });
    }
  }
  return { ready: true, approvedHash: approved.hash, references: approved.references, changedBrIds, removedBrIds, plan, designs: designsToGenerate, skipped, requiresApproval: true, note: 'Proposals only. Existing approved designs, Jira, Confluence and developer code remain unchanged.' };
}
async function savePlan(registry, id, expected, register, raw, { actor = 'AI-assisted draft', model = '' } = {}) {
  const approved = snapshot(register);
  const validated = validatePlan(raw, approved);
  const latest = (await load(registry, id)).plans.at(-1);
  if (latest?.sourceHash === approved.hash) throw Error('This BR snapshot already has a development plan. Review the existing draft.');
  if (latest?.status === 'draft' && latest.manuallyEdited) throw Error('A manually edited draft requires review before creating a new version.');
  return update(registry, id, expected, data => {
    const last = data.plans.at(-1);
    if (last?.sourceHash === approved.hash) throw Error('A delivery plan already exists for these approved BRs.');
    const number = (last?.number || 0) + 1;
    data.plans.push({ id: crypto.randomUUID(), number, status: 'draft', at: new Date().toISOString(), actor: String(actor).slice(0, 120), model: String(model).slice(0, 150), sourceHash: approved.hash, sourceBusinessRequirements: approved.references, plan: validated, markdown: planMarkdown(validated) });
    data.plans = data.plans.slice(-MAX_HISTORY);
    data.events.push({ at: new Date().toISOString(), action: 'draft-created', number, sourceHash: approved.hash });
    data.events = data.events.slice(-200);
  });
}
async function approvePlan(registry, id, expected, register, { proposalId, actor = 'Reviewer' }) {
  const approved = snapshot(register);
  return update(registry, id, expected, data => {
    const last = data.plans.at(-1);
    if (!last || last.id !== proposalId || last.status !== 'draft') throw Error('Only the newest draft delivery plan can be approved.');
    if (last.sourceHash !== approved.hash) throw Error('Approved Business Requirements changed. Regenerate the development plan.');
    const verified = validatePlan(last.plan, approved);
    if (!verified.coverage.completeBrLinks) throw Error('Missing requirement links.');
    last.status = 'approved'; last.approvedAt = new Date().toISOString(); last.approvedBy = String(actor).slice(0, 120);
    data.events.push({ at: last.approvedAt, action: 'plan-approved', number: last.number, actor: last.approvedBy });
    data.events = data.events.slice(-200);
  });
}
module.exports = { snapshot, validatePlan, planPrompt, planMarkdown, load, assess, savePlan, approvePlan };
