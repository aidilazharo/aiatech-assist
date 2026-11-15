'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const webview = fs.readFileSync(path.join(root, 'media/start.js'), 'utf8');
const host = fs.readFileSync(path.join(root, 'test/generated/extension-source.txt'), 'utf8');
const from = webview.indexOf('function actionableJiraChangeRequests(');
const to = webview.indexOf('function renderChangeRequests(){', from);
assert.ok(from >= 0 && to > from, 'visibility predicate must remain a unit-testable pure helper');
const logic = vm.runInNewContext(webview.slice(from, to) + '\n({actionableJiraChangeRequests,hasRelevantJiraChangeRequests})');
const isVisible = (register, protection = [], revision = null) =>
  logic.hasRelevantJiraChangeRequests(register, protection, revision);

test('normal Jira Preview omits zero-count Change Requests and terminal-only history', () => {
  assert.equal(isVisible(null), false);
  assert.equal(isVisible({changeRequests: []}, [], 'rev-3'), false);
  assert.equal(isVisible({changeRequests: [{state: 'closed'}, {state: 'rejected'}]}, [], 'rev-3'), false);
  assert.equal(isVisible({changeRequests: []}, [{blocked: false}], 'rev-3'), false);
});

test('actionable Change Requests remain visible for independent approval and closure', () => {
  for (const state of ['impact-assessed', 'approved', 'implemented']) {
    assert.equal(isVisible({changeRequests: [{state}]}, [], 'rev-4'), true, state);
  }
  assert.equal(logic.actionableJiraChangeRequests({changeRequests: [{state: 'closed'}, {state: 'approved'}]}).length, 1);
});

test('blocked Jira changes surface safeguards only for a current preview', () => {
  const blocked = [{path: 'BR-002', blocked: true, issues: [{key: 'TC-123', known: false}]}];
  assert.equal(isVisible({changeRequests: []}, blocked, 'rev-5'), true);
  assert.equal(isVisible({changeRequests: []}, blocked, null), false);
  assert.equal(isVisible({changeRequests: [{state: 'closed'}]}, blocked, 'rev-5'), true);
});

test('panel is only exposed during Jira Preview with relevant requests or blockers', () => {
  assert.match(webview, /\$\('baCRPanel'\)\.classList\.toggle\('hidden',!showJira\|\|displayed!=='jiraPreview'\|\|!hasRelevantJiraChangeRequests\(brState,jiraProtectionForCR,brPlanRevision\)\)/);
  assert.match(webview, /const entries=actionableJiraChangeRequests\(brState\)/);
  assert.match(host, /id="baCRPanel"/);
  assert.match(host, /case 'brChangeRequestCreate'/);
  assert.match(host, /case 'brChangeRequestDecision'/);
  assert.match(host, /case 'brJiraPreview'/);
  assert.match(host, /prePublishIdentityGuard/);
});

test('release metadata is consistent for v0.2.42', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.version, '0.3.53');
  assert.equal(pkg.atgvDisplayVersion, '0.3.53');
});
