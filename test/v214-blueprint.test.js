'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const blueprint = require('../src/delivery-blueprint');
const { ProjectRegistry } = require('../src/projects');
const approved = (id, revision = 1) => ({ id, approvedRevision: revision, status: 'approved', needsRefresh: false, approvedContent: { title: 'Requirement ' + id, objective: 'Deliver ' + id, scope: 'Project scope', acceptanceCriteria: 'Acceptance for ' + id, features: [{ id: 'F-001', title: 'Feature', description: 'Feature', stories: [] }] } });
const register = (...brs) => ({ brs });
const proposal = (...ids) => ({ title: 'Development Plan', summary: 'AI proposal for review', epics: ids.map((id, i) => ({ id: `EPIC-${i+1}`, title: 'Epic for ' + id, outcome: 'Deliver acceptance criteria', brIds: [id], stories: [{ title: 'Functional story', description: 'Implement approved workflow', brIds: [id], acceptanceCriteria: ['Requirement fulfilled'] }] })) });
async function fixture(cb) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atgv214-')); try { const reg = new ProjectRegistry(dir); await reg.create({ id: 'project', name: 'Project' }); return await cb(reg); } finally { await fs.rm(dir, { recursive: true, force: true }); } }

test('one approved BR queues initial plan and all six designs; unapproved BR does not enter generation', async () => fixture(async r => {
 const state = await blueprint.load(r, 'project');
 const brs = register(approved('BR-001'), { ...approved('BR-002'), status: 'draft' });
 const assessment = blueprint.assess(brs, { designs: {} }, state);
 assert.equal(assessment.ready, true);
 assert.equal(assessment.plan.action, 'create');
 assert.deepEqual(assessment.references.map(x => x.id), ['BR-001']);
 assert.deepEqual(assessment.designs.map(x => x.kind), ['design','ux','mockup','architecture','api','database']);
}));

test('development plan requires every approved BR to be explicitly traced', () => {
 const state = blueprint.snapshot(register(approved('BR-001'), approved('BR-002')));
 assert.throws(() => blueprint.validatePlan(proposal('BR-001'), state), /omits approved BR/);
 assert.throws(() => blueprint.validatePlan(proposal('BR-BOGUS'), state), /missing or unapproved/);
 const valid = blueprint.validatePlan(proposal('BR-001','BR-002'), state);
 assert.deepEqual(valid.coverage.expectedBrIds, ['BR-001','BR-002']);
 assert.equal(valid.coverage.semanticReviewRequired, true);
});

test('new BR and revised BR create new draft, never rewrite an approved plan', async () => fixture(async reg => {
 const a = register(approved('BR-001'));
 const before = await blueprint.load(reg, 'project');
 const first = await blueprint.savePlan(reg, 'project', before.revision, a, proposal('BR-001'));
 assert.equal(first.plans.length, 1);
 assert.equal(first.plans[0].status, 'draft');
 await assert.rejects(blueprint.savePlan(reg, 'project', first.revision, a, proposal('BR-001')), /already/);
 const endorsed = await blueprint.approvePlan(reg, 'project', first.revision, a, { proposalId: first.plans[0].id, actor: 'Reviewer' });
 assert.equal(endorsed.plans[0].status, 'approved');
 const b = register(approved('BR-001'), approved('BR-002'));
 const changed = blueprint.assess(b, { designs: {} }, endorsed);
 assert.equal(changed.plan.action, 'regenerate');
 assert.deepEqual(changed.changedBrIds, ['BR-002']);
 await assert.rejects(blueprint.approvePlan(reg,'project',endorsed.revision,b,{proposalId:first.plans[0].id}),/newest draft/);
 const second = await blueprint.savePlan(reg,'project',endorsed.revision,b,proposal('BR-001','BR-002'));
 assert.equal(second.plans[0].status, 'approved');
 assert.equal(second.plans[1].status, 'draft');
 const revised = blueprint.assess(register(approved('BR-001',2),approved('BR-002')), { designs: {} }, second);
 assert.equal(revised.plan.action, 'regenerate');
 assert.deepEqual(revised.changedBrIds, ['BR-001']);
}));

test('unverified design provenance and manually edited drafts require review', async () => fixture(async reg => {
 const brs = register(approved('BR-001', 2));
 const state = await blueprint.load(reg, 'project');
 const designs = { designs: { api: [{ status: 'draft', manuallyEdited: true, sourceBusinessRequirements: [{ id: 'BR-001', revision: 1 }] }], database: [{ status: 'approved', sourceBusinessRequirements: [{ id: 'BR-DELETED', revision: 1 }] }] } };
 const impact = blueprint.assess(brs, designs, state);
 assert.equal(impact.designs.some(x => x.kind === 'api'), false);
 assert.equal(impact.designs.some(x => x.kind === 'database'), false);
 assert.equal(impact.skipped.some(x => x.kind === 'api' && /Manually edited/.test(x.reason)), true);
 assert.equal(impact.skipped.some(x => x.kind === 'database' && /Unverified/.test(x.reason)), true);
}));

test('blueprint rejects a stale approval after BR revision changes', async () => fixture(async reg => {
 const initial = register(approved('BR-001'));
 const state = await blueprint.load(reg, 'project');
 const generated = await blueprint.savePlan(reg, 'project', state.revision, initial, proposal('BR-001'));
 await assert.rejects(blueprint.approvePlan(reg,'project',generated.revision,register(approved('BR-001',2)),{proposalId:generated.plans[0].id}),/changed/);
}));
