'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const f=path=>fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8');
const br=require('../src/br-workflow');
const {ProjectRegistry}=require('../src/projects');
const tmp=require('node:os');
const fsP=require('node:fs/promises');
test('BA Review panel is collapsed and review actions align after the findings',()=>{
 const h=f('test/generated/extension-source.txt');const start=h.indexOf('<details id="discoveryReviewPanel"');const end=h.indexOf('</details>',start);
 assert.ok(start>0&&end>start);const section=h.slice(start,end);
 assert.doesNotMatch(section.slice(0,100),/\sopen(?:\s|>)/);
 assert.match(section,/id="baReviewSkip"/);
 assert.ok(section.indexOf('id="discoveryReviewApply"')>section.indexOf('id="discoveryReviewSuggestions"'));
 assert.ok(section.indexOf('id="baReviewFinish"')<section.indexOf('id="discoveryReviewApply"'));
 assert.ok(section.indexOf('id="baReviewSkip"')>section.indexOf('id="discoveryReviewApply"'));
 assert.ok(section.indexOf('class="ba-review-footer"')>section.indexOf('id="discoveryReviewSuggestions"'));
});
test('Quill has distinct Draft Save and Approve and draft dirty tracking',()=>{
 const h=f('test/generated/extension-source.txt'),js=f('media/start.js');
 assert.match(h,/id="brEditSave"[^>]*>Save Draft/);
 assert.match(h,/id="brEditApprove"[^>]*disabled>Approve Business Requirements/);
 assert.match(js,/send\('brSaveAndApprove'/);
 assert.match(js,/function updateBREditorActions\(/);
});
test('BA buttons use disabled gray and enabled blue styles and progress indicator',()=>{
 const css=f('media/start.css'),h=f('test/generated/extension-source.txt');
 assert.match(css,/\.ba-process-btn:disabled\{background:#555d68/);
 assert.match(css,/\.ba-process-btn:not\(:disabled\)\{background:#176ed4/);
 assert.match(css,/@keyframes ba-spin/);assert.match(h,/id="baRunning"/);
});
test('Skip AI review requires current persisted discovery and preserves an auditable choice',async()=>{
 const root=await fsP.mkdtemp(require('node:path').join(tmp.tmpdir(),'atgv-039-'));
 try{
  const r=new ProjectRegistry(root);await r.create({id:'a',name:'A'});
  let v=await br.load(r,'a');v=await br.imported(r,'a',v.revision,{name:'source.docx',digest:'a'.repeat(64)});
  v=await br.discoverySaved(r,'a',v.revision,'D1');
  await assert.rejects(br.skipReview(r,'a',v.revision,{discoveryRevision:'STALE',actor:'BA'}),/current|imported/i);
  v=await br.skipReview(r,'a',v.revision,{discoveryRevision:'D1',actor:'BA'});
  assert.equal(JSON.parse(v.reviewText).skipped,true);
  assert.equal(v.reviewRevision,'D1');
  const events=v.events.filter(x=>x.action==='discovery-reviewed');assert.equal(events.length,1);
 }finally{await fsP.rm(root,{recursive:true,force:true});}
});
test('JIRA retirement approval unlocks a fresh preview and completed operations clear progress',()=>{
 const js=f('media/start.js');
 assert.match(js,/if\(m\.type==='brRetirementsApproved'\)\{brPlanRevision=null;brJiraPreviewApproved=false;/);
 assert.match(js,/if\(m\.type==='brJiraPlan'\)\{[^}]*stageProgress\('jiraPreview'[^;]*;baBusy\('',null\)/);
 assert.match(js,/if\(m\.type==='brJiraPlanApproved'\)\{[^}]*stageProgress\('jiraApprove'[^;]*;brJiraPreviewApproved=true;baBusy\('',null\)/);
 assert.match(js,/if\(m\.type==='brJiraDone'\)\{[^}]*stageProgress\('jiraSync'[^;]*;baBusy\('',null\)/);
});
