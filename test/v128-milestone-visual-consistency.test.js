const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Business Requirements milestones share flat styling with Solution Designs',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','media','start.css'),'utf8');
  assert.match(css,/#discoveryView \.discovery-workflow \.workflow-step/);
  assert.match(css,/#planningView \.design-milestone-list \.atgv-milestone\[aria-pressed="true"\]/);
  assert.match(css,/#planningView \.design-milestone-list \.atgv-milestone \.milestone-circle\{/);
  assert.doesNotMatch(css,/#discoveryView \.discovery-workflow \.workflow-step:focus-visible \.milestone-label \{\s*text-decoration:underline/);
  assert.doesNotMatch(css,/#discoveryView \.discovery-workflow \.workflow-step\[aria-pressed="true"\] \.milestone-circle\{outline:3px solid/);
});
