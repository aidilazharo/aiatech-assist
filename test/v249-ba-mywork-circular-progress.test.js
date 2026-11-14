'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const frontend=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const styles=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const progress=require('../media/ba-progress.js');

test('only the Business Analyst My Work title is hidden, other role titles are preserved',()=>{
 assert.match(frontend,/\$\('workTitle'\)\.textContent=visibleRoleLabel\(role\);/);
 assert.match(frontend,/\$\('workTitle'\)\.classList\.toggle\('hidden',role\.id==='business-analyst'\)/);
 assert.match(styles,/#workView\.role-ba-simplified #workTitle\{display:none!important\}/);
 assert.match(host,/<h1 id="workTitle">Business Analyst<\/h1>/);
});

test('Business Requirements uses matching 46px circles, selected blue and completed green',()=>{
 assert.match(styles,/#roleStepButtons \.role-circle-step-marker\{[^}]*46px/);
 assert.match(styles,/#discoveryView \.discovery-workflow \.workflow-step \.milestone-circle\{[^}]*width:46px;[^}]*height:46px;/);
 assert.match(styles,/#discoveryView \.discovery-workflow \.workflow-step\[data-status="success"\] \.milestone-circle\{[^}]*#218963/);
 assert.match(styles,/#discoveryView \.discovery-workflow \.workflow-step\.current:not\(\[data-status="failure"\]\)/);
 assert.match(styles,/#discoveryView \.discovery-workflow::after\{[^}]*milestone-width/);
 assert.match(styles,/@media\(prefers-reduced-motion:reduce\)\{/);
});

test('the original ten workflow milestones and progress behavior remain intact',()=>{
 const steps=progress.derive({started:true,hasSources:true,mappingDone:false});
 assert.equal(steps.length,10);
 assert.equal(steps[0].complete,true);
 assert.equal(steps[1].complete,true);
 assert.equal(steps[2].current,true);
 assert.match(frontend,/node\.classList\.toggle\('done',!idleMilestones&&step\.complete\)/);
 for(const [,id] of progress.definitions)assert.match(host,new RegExp(`id="${id}"`));
});
