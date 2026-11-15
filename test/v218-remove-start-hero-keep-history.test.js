'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('removed redundant Start heading, duplicate New BR create card and completed metric',()=>{
 const panel=host.slice(host.indexOf('<section id="baStartPanel"'),host.indexOf('<section class="source-documents-panel"'));
 assert.doesNotMatch(panel,/STEP 01 \/ BUSINESS ANALYSIS|<h2>Start<\/h2>|ba-start-create-card|ba-start-history-metric|baStartGuidance|baStartPublishedCount/);
 assert.doesNotMatch(host,/id="baStart"/);
 assert.match(panel,/id="baCompletedSection"/);
 assert.match(css,/\.ba-start-history-only\{background:transparent/);
});
test('keeps only the header New Business Requirement, Start milestone, and collapsed BR/Jira history',()=>{
 assert.equal((host.match(/id="baNewRequirement"/g)||[]).length,1);
 assert.match(host,/id="discoveryStepStart"/);
 assert.match(host,/id="baCompletedList"/);
 assert.match(host,/id="baCompletedJiraHistory"/);
 assert.match(ui,/details\.className='ba-completed-br-section';details\.dataset\.requirementId=group\.id;details\.open=expandedBrIds\.has\(group\.id\)/);
 assert.match(ui,/\$\('baNewRequirement'\)\.addEventListener\('click',beginNewBusinessRequirement\)/);
 assert.match(ui,/send\('startOrRestartBusinessRequirements',\{revision:brState\.revision,openUploadImmediately:true\}\)/);
 assert.match(ui,/\$\('baStartPanel'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
});
test('does not change 10-step workflow or hide completed history outside Start',()=>{
 assert.equal((host.match(/class="workflow-step atgv-milestone"/g)||[]).length,10);
 assert.match(ui,/\$\('baCompletedSection'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
 assert.equal(require('../package.json').version,'0.3.51');
});
