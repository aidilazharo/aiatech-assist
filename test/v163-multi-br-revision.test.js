'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { ProjectRegistry } = require('../src/projects');
const { importDocumentText } = require('../src/discovery-import');
const store = require('../src/source-store');
const br = require('../src/br-workflow');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

async function fixture(fn) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'atgv-v163-'));
  const registry = new ProjectRegistry(folder);
  try {
    await registry.create({ id: 'workplace', name: 'Workplace Operations Portal' });
    return await fn(registry, folder);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
}
const visitor = {
  title: 'Visitor Registration and Reception Check-In',
  objective: 'Track visitor registrations and reception check-in approvals',
  scope: 'Visitor reservations, arrival validation and reception check-in',
  acceptanceCriteria: 'Reception permits check-in from scheduled arrival time',
  features: []
};
const equipment = {
  title: 'IT Equipment Loan Management',
  objective: 'Track IT equipment loans and returns for employees',
  scope: 'Manage device checkout, asset custody and returns',
  acceptanceCriteria: 'Employees must return equipment before due date',
  features: []
};
function pdf(text) {
  const escaped = text.replace(/[\\()]/g, c => '\\' + c);
  const stream = `BT /F1 12 Tf (${escaped}) Tj ET`;
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`, 'latin1');
}
async function upload(registry, folder, name, text) {
  const file = path.join(folder, name);
  await fs.writeFile(file, pdf(text));
  const extracted = await importDocumentText(file);
  const entry = { ...extracted, name, digest: sha(extracted.text) };
  entry.storedName = await store.store(registry, 'workplace', entry, file);
  return entry;
}
async function mapping(registry, current, documents, rev) {
  const digests = documents.map(d => d.digest);
  current = await br.commitSourceMapping(registry, 'workplace', current.revision, {
    digests,
    proposals: documents.map(d => ({ filename: d.name, answers: { problem: `Requirements from ${d.name}` } }))
  });
  current = await br.discoverySaved(registry, 'workplace', current.revision, rev);
  current = await br.skipReview(registry, 'workplace', current.revision, { discoveryRevision: rev, actor: 'Test BA' });
  return current;
}
async function saveAndApprove(registry, current, id) {
  const item = current.brs.find(x => x.id === id);
  current = await br.edit(registry, 'workplace', current.revision, { brId: id, content: {
    title: item.title, objective: item.objective, scope: item.scope,
    acceptanceCriteria: item.acceptanceCriteria, features: item.features
  }, actor: 'Test BA' });
  return br.approve(registry, 'workplace', current.revision, { brId: id, actor: 'Test BA' });
}

test('one project creates two BRs; revising visitor source updates only its existing BR and Jira Epic', () => fixture(async (registry, folder) => {
  const original = await upload(registry, folder, '01_Visitor_Registration.pdf', 'Visitor Registration and Reception Check-In. Track visitor registrations and reception check-in approvals. Reception permits check-in from scheduled arrival time.');
  const asset = await upload(registry, folder, '02_IT_Equipment_Loans.pdf', 'IT Equipment Loan Management. Track IT equipment loans and returns for employees. Manage device checkout and asset custody.');
  let current = await br.load(registry, 'workplace');
  current = await br.addSources(registry, 'workplace', current.revision, [original, asset]);
  current = await mapping(registry, current, [original, asset], 'REV-1');
  current = await br.generated(registry, 'workplace', current.revision, { discoveryRevision: 'REV-1', requirements: [visitor, equipment] });
  assert.equal(current.brs.length, 2);
  const visitorId = current.brs.find(x => x.title === visitor.title).id;
  const assetId = current.brs.find(x => x.title === equipment.title).id;
  assert.notEqual(visitorId, assetId);
  current = await saveAndApprove(registry, current, visitorId);
  current = await saveAndApprove(registry, current, assetId);
  assert.deepEqual(current.brs.map(x => x.status), ['approved', 'approved']);
  for (const [id, key] of [[visitorId, 'TC-101'], [assetId, 'TC-201']]) {
    const item = br.plan(current).find(x => x.path === id && x.action === 'create');
    assert.ok(item);
    current = await br.beginOperation(registry, 'workplace', current.revision, { path: id, action: 'create', hash: item.hash });
    current = await br.recorded(registry, 'workplace', current.revision, { path: id, action: 'create', hash: item.hash, key, kind: 'Epic' });
  }
  assert.deepEqual(br.plan(current), []);
  const revised = await upload(registry, folder, '01_Visitor_Registration.pdf', 'Visitor Registration and Reception Check-In. Track visitor registrations and reception check-in approvals. Reception permits check-in fifteen minutes before scheduled arrival time.');
  current = await br.addSources(registry, 'workplace', current.revision, [revised, asset]);
  const sourceV2 = current.sourceDocuments.find(x => x.name === revised.name);
  assert.equal(sourceV2.sourceId, current.archivedSources.find(x => x.digest === original.digest).sourceId);
  assert.equal(sourceV2.version, 2);
  assert.equal(current.synced[visitorId].key, 'TC-101');
  assert.equal(current.synced[assetId].key, 'TC-201');
  current = await mapping(registry, current, [revised], 'REV-2');
  current = await br.generated(registry, 'workplace', current.revision, {
    discoveryRevision: 'REV-2',
    requirements: [{ ...visitor, id: visitorId, acceptanceCriteria: 'Reception permits check-in fifteen minutes before scheduled arrival time' }],
    targetBrIds: [visitorId]
  });
  assert.equal(current.brs.length, 2, 'must not create a third BR');
  assert.equal(current.brs.find(x => x.id === visitorId).status, 'draft');
  assert.equal(current.brs.find(x => x.id === assetId).status, 'approved');
  assert.equal(current.brs.find(x => x.id === assetId).approvedRevision, 1);
  assert.deepEqual(br.plan(current), [], 'unapproved revision may not cause Jira changes');
  current = await saveAndApprove(registry, current, visitorId);
  const updates = br.plan(current);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].path, visitorId);
  assert.equal(updates[0].action, 'update');
  assert.equal(updates[0].key, 'TC-101');
  current = await br.beginOperation(registry, 'workplace', current.revision, { path: visitorId, action: 'update', hash: updates[0].hash });
  current = await br.recorded(registry, 'workplace', current.revision, { path: visitorId, action: 'update', hash: updates[0].hash, key: 'TC-101', kind: 'Epic' });
  assert.deepEqual(br.plan(current), []);
  assert.equal(current.brs.find(x => x.id === visitorId).approvedRevision, 2);
  assert.equal(current.brs.find(x => x.id === assetId).approvedRevision, 1);
  assert.equal(current.synced[assetId].key, 'TC-201');
}));

test('AI cannot recycle approved visitor BR ID for unrelated equipment scope', () => fixture(async registry => {
  let current = await br.load(registry, 'workplace');
  current = await br.imported(registry, 'workplace', current.revision, { name: 'requirements.pdf', digest: 'a'.repeat(64) });
  current = await br.discoverySaved(registry, 'workplace', current.revision, 'REV-1');
  current = await br.skipReview(registry, 'workplace', current.revision, { discoveryRevision: 'REV-1', actor: 'BA' });
  current = await br.generated(registry, 'workplace', current.revision, { discoveryRevision: 'REV-1', requirements: [visitor] });
  current = await saveAndApprove(registry, current, current.brs[0].id);
  const revision = current.revision;
  const original = structuredClone(current.brs[0].approvedContent);
  await assert.rejects(br.generated(registry, 'workplace', revision, {
    discoveryRevision: 'REV-1', requirements: [{ ...equipment, id: current.brs[0].id }]
  }), /does not match the proposed scope|different source document/);
  const after = await br.load(registry, 'workplace');
  assert.equal(after.revision, revision, 'rejected AI output cannot mutate register');
  assert.deepEqual(after.brs[0].approvedContent, original);
}));

test('a separate uploaded document cannot hijack an approved BR with an identical generic title', () => fixture(async (registry, folder) => {
  const first = await upload(registry, folder, 'original-visitor.pdf', 'Visitor Registration and Reception Check-In. Track visitor registrations and reception check-in approvals. Reception permits check-in from scheduled arrival time.');
  let current = await br.load(registry, 'workplace');
  current = await br.addSources(registry, 'workplace', current.revision, [first]);
  current = await mapping(registry, current, [first], 'REV-1');
  current = await br.generated(registry, 'workplace', current.revision, { discoveryRevision: 'REV-1', requirements: [visitor] });
  const id = current.brs[0].id;
  current = await saveAndApprove(registry, current, id);
  const unrelatedFile = await upload(registry, folder, 'independent-visitor.pdf', 'Visitor Registration and Reception Check-In. Track visitor registrations and reception check-in approvals for another independently owned business capability. Reception permits check-in from scheduled arrival time.');
  current = await br.addSources(registry, 'workplace', current.revision, [first, unrelatedFile]);
  current = await mapping(registry, current, [unrelatedFile], 'REV-2');
  const originalRevision = current.revision;
  await assert.rejects(br.generated(registry, 'workplace', current.revision, {
    discoveryRevision: 'REV-2', requirements: [visitor]
  }), /different source document/);
  const state = await br.load(registry, 'workplace');
  assert.equal(state.revision, originalRevision);
  assert.equal(state.brs.length, 1);
  assert.equal(state.brs[0].approvedRevision, 1);
}));
