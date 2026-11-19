'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const host=fs.readFileSync(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','media','start.js'),'utf8');
const {QUESTIONS,assess}=require('../src/ba-discovery');

test('BA step navigation displays only Previous and Next buttons, not redundant heading and step counter',()=>{
 const start=host.indexOf('<section id="baStepNavigation"');
 const end=host.indexOf('</section>',start);
 assert.ok(start>=0&&end>start);
 const panel=host.slice(start,end);
 assert.match(panel,/id="baPreviousStep"/);
 assert.match(panel,/id="baNextStep"/);
 assert.doesNotMatch(panel,/Workflow navigation|Step 2 of 10|baStepNavigationStatus|ba-step-navigation-heading/);
 assert.doesNotMatch(ui,/baStepNavigationStatus/);
});
test('12 discovery answers count trimmed nonempty responses and identify the missing question',()=>{
 const answers=Object.fromEntries(QUESTIONS.map(([key])=>[key,'A documented answer']));
 answers[QUESTIONS[10][0]]='  '; // Question 11 is not filled even with whitespace.
 const state=assess(answers);
 assert.equal(state.filled,11);
 assert.equal(state.total,12);
 assert.deepEqual(state.missing,[{key:'measures',label:'Measurable success criteria'}]);
 assert.match(ui,/const missingQuestionDetails=missing\.slice\(0,2\)/);
 assert.match(ui,/`Q\$\{index\+1\}: \$\{item\.label\}`/);
 assert.match(ui,/\$\{missing\.length\} unanswered/);
});
