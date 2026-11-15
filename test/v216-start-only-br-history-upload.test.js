'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('approved BR history belongs to Start only and is never moved into a floating sibling',()=>{
 const start=host.slice(host.indexOf('<section id="baStartPanel"'),host.indexOf('<section class="source-documents-panel"'));
 assert.match(start,/id="baCompletedSection"/);
 assert.equal((host.match(/id="baCompletedSection"/g)||[]).length,1);
 assert.match(ui,/\$\('baCompletedSection'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
 assert.doesNotMatch(ui,/\$\('baStartPanel'\)\.after\(completedHistory\)/);
});

test('completed BR record panels are default-collapsed with dark gray styling',()=>{
 assert.match(ui,/details\.className='ba-completed-br-section';details\.dataset\.requirementId=group\.id;details\.open=expandedBrIds\.has\(group\.id\)/);
 assert.match(css,/#discoveryView \.ba-completed-flat \.ba-completed-br-section\{background:#32343a/);
 assert.match(css,/#discoveryView \.ba-completed-flat\{background:transparent/);
 assert.doesNotMatch(host,/<details id="baCompletedJiraHistory"[^>]*\sopen\b/);
});

test('new BR action starts cycle then opens native upload; resume pending cycle without duplicate start',()=>{
 assert.match(ui,/function beginNewBusinessRequirement\(\)/);
 assert.match(ui,/if\(brState\.restartPending&&[!]\(brState\.sourceDocuments\|\|\[\]\)\.length\)/);
 assert.match(ui,/send\('startOrRestartBusinessRequirements',\{revision:brState\.revision,openUploadImmediately:true\}\)/);
 assert.match(ui,/\$\('baNewRequirement'\)\.addEventListener\('click',beginNewBusinessRequirement\)/);
 const action=host.slice(host.indexOf("case 'startOrRestartBusinessRequirements':"),host.indexOf("case 'restartDiscoverySources':"));
 assert.match(action,/if\(msg\.openUploadImmediately\)\{/);
 assert.match(action,/await importDiscoveryDocument\('business-analyst'\)/);
 assert.match(host,/showOpenDialog\(\{title:'Upload one Word or PDF document for this Business Requirement'/);
});

test('release version is 0.2.42 and BA workflow still has Start plus nine other milestones',()=>{
 assert.equal(require('../package.json').version,'0.3.52');
 assert.equal((host.match(/class="workflow-step atgv-milestone"/g)||[]).length,10);
});
