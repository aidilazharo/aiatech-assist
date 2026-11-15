'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const host=read('test/generated/extension-source.txt'),js=read('media/start.js'),css=read('media/start.css');
const {derive}=require('../media/ba-progress');

test('milestone stepper is implemented in actual HTML/CSS and not just release notes',()=>{
 assert.equal((host.match(/class="workflow-step atgv-milestone"/g)||[]).length,10);
 assert.match(host,/id="designMilestones" class="design-milestone-list atgv-milestone-flow"/);
 assert.match(css,/\.milestone-circle/);
 assert.match(css,/\.milestone-tick/);
 assert.match(css,/--milestone-width/);
 assert.match(js,/function renderDesignMilestones\(processes\)/);
 assert.match(js,/renderDesignMilestones\(processes\)/);
 assert.match(js,/designExpandedKinds\.clear\(\)/);
 assert.doesNotMatch(host,/class="workflow-step"[^>]*>1 Upload/);
});

test('Business Requirements milestone statuses do not falsely complete after discovery becomes stale',()=>{
 const base={hasSources:true,mappingDone:true,savedDiscovery:true,reviewFinalized:true,generated:true,totalBrs:1,savedBrs:1,allApproved:true,jiraPreview:true,jiraApproved:true,published:true};
 assert.equal(derive(base).every(p=>p.complete),true);
 for(const lost of ['hasSources','mappingDone','savedDiscovery','reviewFinalized']){
  const changed=derive({...base,[lost]:false});
  assert.ok(changed.slice(changed.findIndex(p=>!p.complete)).every(p=>!p.complete));
 }
 const failure=derive({...base,published:false,failedStep:'publish'});
 assert.equal(failure[9].state,'failure');
 assert.equal(failure[9].selectable,true);
});

test('route handlers navigate to unlocked stage rather than scrolling to hidden controls',()=>{
 assert.match(js,/function openBAWorkflowStep\(key\)/);
 assert.match(js,/if\(view!=='discovery'\)return false/);
 assert.match(js,/if\(!node\|\|node\.disabled\)/);
 assert.match(js,/openBAWorkflowStep\('jiraPreview'\)/);
 assert.match(js,/openBAWorkflowStep\('upload'\)/);
 assert.doesNotMatch(js,/\$\('brJiraPreview'\)\.scrollIntoView/);
 assert.doesNotMatch(js,/\$\('sourceDocuments'\)\.scrollIntoView\(\{block:'start'\}\)/);
});

test('returning to Upload recalculates Submit Selected Documents instead of retaining a stuck disabled flag',()=>{
 assert.match(js,/updateSourceSubmitButton\(\)/);assert.match(js,/button\.disabled=processing\|\|!selectable/);
 assert.doesNotMatch(js,/\$\('sourceProcessSubmit'\)\.disabled=\$\('sourceProcessSubmit'\)\.disabled\|\|/);
});

test('all main sidebar route values have a corresponding navigation branch',()=>{
 const names=[...host.matchAll(/class="nav-item(?:[^"]*)"[^>]*data-nav="([^"]+)"/g)].map(m=>m[1]);
 for(const name of names)assert.match(js,new RegExp('destination===\''+name+'\'|destination===\'sdlc-roles\''));
});

test('v0.1.37 display version agrees with packaging SemVer and no editor group is created by previews',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.version,'0.3.53');assert.equal(pkg.atgvDisplayVersion,'0.3.53');
 assert.match(host,/atgvDisplayVersion :'0\.3\.53'/);
 assert.doesNotMatch(js,/editorLayoutTwoColumns|ViewColumn\.Two/);
});
