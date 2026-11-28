'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const frontend=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const progress=require('../media/ba-progress');
const workflow=require('../src/br-workflow');
const approved={id:'BR-007',title:'Visitor Registration',status:'approved',approvedRevision:1,needsRefresh:false,approvedContent:{title:'Visitor Registration',objective:'Visitor approval',scope:'Reception',acceptanceCriteria:'Check in and check out',features:[]},source:{name:'visitor.pdf'}};
test('approval step progresses from 7 to Jira Preview when only the current BR is approved',()=>{
 const archived={...approved,id:'BR-001',archivedFromRestart:true,needsRefresh:true};
 const current=[archived,approved].filter(br=>br.status!=='retired'&&!br.archivedFromRestart);
 assert.equal(current.length,1);assert.equal(current[0].id,'BR-007');
 const p=progress.derive({started:true,hasSources:true,mappingDone:true,savedDiscovery:true,reviewFinalized:true,generated:true,totalBrs:current.length,savedBrs:1,allApproved:current.every(br=>br.status==='approved'&&!br.needsRefresh)});
 assert.equal(p[6].key,'approve');assert.equal(p[6].state,'success');assert.equal(p[7].key,'jiraPreview');assert.equal(p[7].current,true);
 assert.match(frontend,/const activeBrs=activeBusinessRequirements\(\); \/\/ Exclude preserved history/);
});
test('backend Jira approval checks exclude archived completed-cycle BRs',()=>{
 assert.match(host,/const currentRequirements=register\.brs\.filter\(item=>!item\.archivedFromRestart/);
 assert.match(host,/!x\.archivedFromRestart&&x\.externalReviewRequired/);
 const register={brs:[{...approved,id:'BR-001',archivedFromRestart:true,needsRefresh:true},approved],synced:{},retirementApprovals:{}};
 assert.deepEqual(workflow.plan(register).map(i=>i.path),['BR-007']);
});
test('approved BR advances with one Next Step action; duplicate Preview buttons are removed',()=>{
 assert.doesNotMatch(host,/id="baContinueToJira"|id="brEditJira"/);
 assert.doesNotMatch(frontend,/baContinueToJira|brEditJira/);
 assert.match(host,/id="baNextStep"/);
 assert.match(frontend,/openBAWorkflowStep\(key\)/);
 assert.match(host,/id="baMilestoneError"[^>]*role="alert"/);
 assert.match(frontend,/stageError\.textContent=/);
});
test('compact buttons retain their semantic text while displaying icons with full tooltips',()=>{
 assert.match(frontend,/function atgvCompactRequirementActions\(root\)/);
 assert.match(frontend,/button\.setAttribute\('aria-label',full\)/);
 assert.match(frontend,/button\.setAttribute\('title',full\+/);
 assert.match(frontend,/\.br-card-action-row > button/);
 assert.match(frontend,/\.ba-step-reopen > button/);
 assert.match(css,/button\.atgv-icon-action\{font-size:0!important/);
});
test('every role uses native VS Code sidebar colors and focus accent',()=>{
 assert.match(frontend,/nav\.style\.setProperty\('--role-pane-bg','var\(--vscode-sideBar-background/);
 assert.match(frontend,/nav\.style\.setProperty\('--role-nav-accent','var\(--vscode-focusBorder/);
 assert.match(css,/\.sidebar,\.sidebar-footer\{background:var\(--vscode-sideBar-background/);
});
