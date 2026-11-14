'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tdd=require('../src/developer-tdd');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');

const keyboardFailure=`✗ can type name
  Error: Expected key descriptor but found "" in ""
  Error: expect(element).toHaveTextContent()`;

test('malformed user-event keyboard parsing is invalid RED, not proof of a missing feature',()=>{
 const rows=[{passed:false,target:'root',logs:keyboardFailure}];
 assert.equal(tdd.invalidKeyboardTestEvidence(rows),true);
 assert.equal(tdd.redInfrastructureFailure(rows),true);
 assert.throws(()=>tdd.verifyRed(rows),/invalid test or environment error/);
 assert.equal(tdd.redInfrastructureFailure([{passed:false,logs:'AssertionError: expected "Alice" but found ""'}]),false);
});

test('RED retry feedback describes the keyboard-parser defect and preserves test-only restrictions',()=>{
 assert.match(host,/invalidKeyboardTestEvidence\(red\)/);
 assert.match(host,/RED failed due to a test-runner/);
 const p=tdd.testsOnlyPrompt({brId:'BR-008',revision:1,stackId:'react',brText:'Save name',source:{files:[],previews:[]},criterion:{id:'AC-04',description:'Keyboard access for a person name',acceptance:'Typing valid characters works'}});
 assert.match(p,/Expected key descriptor but found/);
 assert.match(p,/NEVER pass an unescaped malformed brace/);
 assert.match(p,/Do not change application source/);
});

test('GREEN uses bounded diagnostic repair, and only advances to true REFACTOR after passing',()=>{
 assert.equal(tdd.GREEN_IMPLEMENTATION_ATTEMPTS,3);
 assert.equal(tdd.GREEN_RECOVERY_ATTEMPTS,3);
 assert.equal(tdd.GREEN_MAX_ATTEMPTS,6);
 const start=host.indexOf('let greenPassed=false;');
 const end=host.indexOf('newFeatures++;criterion.status=\'green-verified\'',start);
 const block=host.slice(start,end);
 assert.match(block,/for\(let attempt=0;attempt<developerTdd\.GREEN_MAX_ATTEMPTS;attempt\+\+\)/);
 assert.match(block,/developerTdd\.greenRecoveryPrompt\(scopedArgs\)/);
 assert.match(block,/developerTdd\.restoreChanges\(beforeGreen\)/);
 assert.match(block,/developerTdd\.assertLockedTests\(lockedTests\)/);
 assert.match(block,/TDD_REPAIR_BLOCKED/);
 assert.match(block,/criterion\.status='needs-attention'/);
 assert.ok(end>start);
});

test('recovery prompt forbids rewriting locked tests or reporting REFACTOR as complete',()=>{
 const prompt=tdd.greenRecoveryPrompt({brId:'BR-008',revision:1,stackId:'react',brText:'Name CRUD',source:{files:['src/App.jsx'],previews:[]},criterion:{id:'AC-04',description:'Typing a name',acceptance:'Typing works'},lockedTestSources:[{relative:'src/people.test.jsx',content:'expect(screen.getByRole("textbox")).toBeVisible()'}],repairLog:keyboardFailure});
 assert.match(prompt,/AUTOMATIC GREEN RECOVERY/);
 assert.match(prompt,/not a successful REFACTOR/);
 assert.match(prompt,/preserve the last passing application source and ALL locked tests/);
 assert.match(prompt,/expect\(screen\.getByRole/);
 assert.match(prompt,/Expected key descriptor but found/);
});

test('Developer UI displays active GREEN during repair and actionable Needs Attention when exhausted',()=>{
 assert.match(ui,/\['code','repair'\]\.includes\(msg\.stage\)\?'green'/);
 assert.match(ui,/developerBrStage==='needs-attention'/);
 assert.match(ui,/Auto-repair paused — review required/);
 assert.match(ui,/↻ Retry Development/);
 assert.match(host,/canRetry:attention\|\|run\.checksPassed===true/);
});
