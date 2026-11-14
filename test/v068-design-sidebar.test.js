'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const designs=require('../src/design-proposals');
const source=require('node:fs');
const base=path.join(__dirname,'..');
const html=source.readFileSync(path.join(base,'test/generated/extension-source.txt'),'utf8');
const js=source.readFileSync(path.join(base,'media/start.js'),'utf8');
const css=source.readFileSync(path.join(base,'media/start.css'),'utf8');
const example={title:'Customer registration',summary:'Registration design draft',screens:[{name:'Register',purpose:'Create account',components:['Email field','Submit'],interactions:['Submit registration']}],flows:['Register then confirm'],assumptions:['OTP requires confirmation'],questions:['Which OTP method?']};
test('design generation requires an immutable approved BR and rejects malformed AI output',()=>{
 assert.throws(()=>designs.approvedInputs({brs:[]}),/Approve a Business Requirement/);
 const inputs=designs.approvedInputs({brs:[{id:'BR-001',status:'approved',approvedRevision:1,approvedContent:{title:'Registration',objective:'Register',scope:'Identity',acceptanceCriteria:'OTP',features:[]}}]});
 assert.equal(inputs.entries.length,1);assert.equal(inputs.entries[0].revision,1);
 assert.deepEqual(designs.validate(example,'mockup').screens[0].components,['Email field','Submit']);
 assert.throws(()=>designs.validate({title:'x',screens:[]},'mockup'),/at least one/);
 assert.throws(()=>designs.validate(example,'invalid'),/Unsupported/);
 assert.match(designs.prompt('ux',inputs),/immutable approved BR/);
});
test('draft design regeneration retains manual edits and earlier revisions',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-design068-'));
 try{
  const registry=new ProjectRegistry(root);await registry.create({id:'sample',name:'Sample'});
  let snapshot=await designs.load(registry,'sample');
  snapshot=await designs.add(registry,'sample',snapshot.revision,{kind:'mockup',approvedHash:'hash-one',proposal:example,actor:'BA'});
  assert.equal(snapshot.designs.mockup.length,1);
  const first=snapshot.designs.mockup[0];
  snapshot=await designs.edit(registry,'sample',snapshot.revision,{kind:'mockup',proposalId:first.id,content:'Human edited draft'});
  await assert.rejects(designs.edit(registry,'sample','outdated',{kind:'mockup',proposalId:first.id,content:'overwrite'}),/another session/);
  snapshot=await designs.add(registry,'sample',snapshot.revision,{kind:'mockup',approvedHash:'hash-two',proposal:{...example,title:'Revised UX'},actor:'BA'});
  assert.equal(snapshot.designs.mockup.length,2);assert.equal(snapshot.designs.mockup[0].content,'Human edited draft');assert.equal(snapshot.designs.mockup[0].sourceHash,'hash-one');assert.equal(snapshot.designs.mockup[1].sourceHash,'hash-two');
  const reloaded=await designs.load(registry,'sample');assert.equal(reloaded.designs.mockup[0].content,'Human edited draft');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('role selector shows role-use dots without readiness counters, sidebar adopts role color',()=>{
 assert.match(js,/role-used-marker/);assert.match(js,/markRoleUsed/);assert.doesNotMatch(js,/option\.textContent=role\.label\+\(ready/);
 assert.match(css,/\.sidebar\{background:color-mix\(in srgb,var\(--role-pane-bg/);
 assert.match(css,/\.role-used-marker\.is-used\{background:#3987f5/);
 assert.match(html,/>SDLC<\/button>/);assert.match(html,/>SDLC Readiness<\/h1>/);
 assert.match(html,/>Solution Designs<\/h1>/);
 assert.doesNotMatch(html,/Deterministic prerequisite checks from saved BA discovery/);
});
test('design controls and consent notification appear in existing webview',()=>{
 for(const token of ['designCards','designPreview','designDraftText','designSaveDraft'])assert.match(html,new RegExp('id="'+token+'"'));
 assert.match(js,/Generate Design/);assert.match(js,/Regenerate'/);assert.match(js,/designGenerate/);
 assert.match(js,/type==='aiSendConsent'/);assert.match(html,/case 'aiSendConsentResponse'/);
 assert.doesNotMatch(html,/showWarningMessage\([\s\S]{0,200}Send to AI model/);
});
