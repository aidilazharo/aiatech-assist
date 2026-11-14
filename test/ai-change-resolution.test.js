'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AIChangeResolutionService, InMemoryChangeStore } = require('../src/ai-change-resolution/service');

const actor = { id: 'user-01', roles: ['Business Analyst'] };
const finding = { id: 'issue-01', title: 'Conflicting approval condition', sourceFingerprint: 'source-revision-1', affectedArtifacts: ['BR-001', 'DESIGN-002'], severity: 'high' };

function setup(override = {}) {
  const calls = { model: 0, preview: 0, apply: 0 };
  let currentFingerprint = finding.sourceFingerprint;
  const store = new InMemoryChangeStore();
  const model = { generate: async ({ instructions }) => {
    calls.model++;
    return { summary: `Resolve rules ${instructions}`, rationale: 'Normalize approval thresholds.', risk: 'medium', changes: [{ artifactId: 'BR-001', operation: 'update', expectedVersion: 'v1', proposedContent: 'Approved rule' }], dependencies: ['DESIGN-002'] };
  }};
  const workflow = {
    context: async () => ({ approvedRequirements: [], sourceDocuments: [] }),
    fingerprint: async () => currentFingerprint,
    preview: async ({ plan }) => { calls.preview++; return { summary: plan.summary, diff: [{ artifactId: 'BR-001', before: 'Original', after: 'Approved rule' }] }; },
    apply: async args => { calls.apply++; assert.equal(args.publishExternally, false); assert.equal(args.approval.by, actor.id); return { success: true, appliedIds: ['BR-001'] }; }
  };
  const service = new AIChangeResolutionService({ store, model, workflow, authorize: async () => true, ...override });
  return { service, store, calls, workflow, model, setFingerprint: v => { currentFingerprint = v; } };
}

async function seeded(fixture = setup()) {
  await fixture.service.ingest('project', [finding], actor);
  return fixture;
}

async function getError(run, expectedCode) {
  await assert.rejects(run, error => error.code === expectedCode);
}

test('detecting issues preserves stable identifiers and source fingerprints', async () => {
  const { service } = await seeded();
  const items = await service.snapshot('project');
  assert.equal(items[0].status, 'detected');
  assert.equal(items[0].id, finding.id);
  assert.equal(items[0].sourceFingerprint, finding.sourceFingerprint);
});

test('generate, preview, approve, apply in enforced order', async () => {
  const { service, calls } = await seeded();
  await getError(() => service.approve('project', finding.id, actor), 'PREVIEW_REQUIRED');
  await getError(() => service.apply('project', finding.id, actor), 'APPROVAL_REQUIRED');
  await service.generate('project', finding.id, actor);
  await getError(() => service.approve('project', finding.id, actor), 'PREVIEW_REQUIRED');
  await service.preview('project', finding.id, actor);
  await service.approve('project', finding.id, actor);
  const result = await service.apply('project', finding.id, actor);
  assert.equal(result.status, 'applied');
  assert.equal(result.history.filter(x => x.action === 'approved').length, 1);
  assert.equal(calls.model, 1);
  assert.equal(calls.preview, 1);
  assert.equal(calls.apply, 1);
});

test('regeneration invalidates prior preview and approval', async () => {
  const { service } = await seeded();
  await service.generate('project', finding.id, actor);
  await service.preview('project', finding.id, actor);
  await service.approve('project', finding.id, actor);
  const changed = await service.generate('project', finding.id, actor, 'Use a different threshold');
  assert.equal(changed.status, 'draft');
  assert.equal(changed.approval, null);
  assert.equal(changed.preview, null);
  assert.equal(changed.instructions, 'Use a different threshold');
  await getError(() => service.apply('project', finding.id, actor), 'APPROVAL_REQUIRED');
});

test('applying a completed resolution is idempotent', async () => {
  const { service, calls } = await seeded();
  await service.generate('project', finding.id, actor);
  await service.preview('project', finding.id, actor);
  await service.approve('project', finding.id, actor);
  await service.apply('project', finding.id, actor);
  await service.apply('project', finding.id, actor);
  assert.equal(calls.apply, 1);
});

test('changed source before applying blocks propagation', async () => {
  const fixture = await seeded();
  const { service, calls } = fixture;
  await service.generate('project', finding.id, actor);
  await service.preview('project', finding.id, actor);
  await service.approve('project', finding.id, actor);
  fixture.setFingerprint('source-revision-2');
  await getError(() => service.apply('project', finding.id, actor), 'STALE_SOURCE');
  assert.equal(calls.apply, 0);
  assert.equal((await service.get('project', finding.id)).status, 'conflict');
});

test('changed source before generation never produces a proposal', async () => {
  const fixture = await seeded();
  fixture.setFingerprint('unexpected-source');
  await getError(() => fixture.service.generate('project', finding.id, actor), 'STALE_SOURCE');
  assert.equal(fixture.calls.model, 0);
});

test('unchanged findings preserve existing proposals; updated findings invalidate them', async () => {
  const { service } = await seeded();
  await service.generate('project', finding.id, actor);
  await service.ingest('project', [finding], actor);
  assert.equal((await service.get('project', finding.id)).status, 'draft');
  await service.ingest('project', [{ ...finding, sourceFingerprint: 'revision-2' }], actor);
  const result = await service.get('project', finding.id);
  assert.equal(result.status, 'detected');
  assert.equal(result.proposal, null);
});

test('role policy denies approval', async () => {
  const { service } = await seeded(setup({ authorize: async ({ action }) => action !== 'approve' }));
  await service.generate('project', finding.id, actor);
  await service.preview('project', finding.id, actor);
  await getError(() => service.approve('project', finding.id, actor), 'FORBIDDEN');
});

test('invalid AI plan is rejected', async () => {
  const { service } = await seeded(setup({ model: { generate: async () => ({ summary: 'Broken', changes: [] }) } }));
  await getError(() => service.generate('project', finding.id, actor), 'INVALID_PLAN');
});

test('concurrent updates are detected by store revision comparison', async () => {
  const { service, store } = await seeded();
  const prior = await service.get('project', finding.id);
  const later = { ...prior, status: 'rejected', revision: prior.revision + 1 };
  await store.put('project', finding.id, later, prior.revision);
  await getError(() => store.put('project', finding.id, prior, prior.revision), 'CONCURRENT_EDIT');
});

test('duplicate issue identifiers are rejected', async () => {
  const { service } = setup();
  await getError(() => service.ingest('project', [finding, finding], actor), 'DUPLICATE_ISSUE');
});

test('rejected resolution cannot be applied', async () => {
  const { service } = await seeded();
  await service.generate('project', finding.id, actor);
  await service.reject('project', finding.id, actor, 'Wrong assumption');
  await getError(() => service.apply('project', finding.id, actor), 'APPROVAL_REQUIRED');
});

