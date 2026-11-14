'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {ProjectRegistry}=require('../src/projects');
const br=require('../src/br-workflow');
const local=require('node:fs');
const read=file=>local.readFileSync(path.join(__dirname,'..',file),'utf8');
const a='a'.repeat(64),b='b'.repeat(64);
const item=(id,entries,status='approved')=>({id,title:'Requirement '+id,status,needsRefresh:false,approvedContent:{title:'Requirement '+id,objective:'O',scope:'S',acceptanceCriteria:'A',features:[]},evidence:entries.map(digest=>({verified:true,digest,passage:'Evidence'})),source:{digest:'aggregate'}});
const fixture=async(callback)=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv84-source-'));
 try{
  const registry=new ProjectRegistry(home);await registry.create({id:'demo',name:'Demo'});
  let state=await br.load(registry,'demo');
  state=await br.addSources(registry,'demo',state.revision,[{name:'a.pdf',digest:a,storedName:a+'.pdf'},{name:'b.pdf',digest:b,storedName:b+'.pdf'}]);
  return await callback(registry,state);
 }finally{await fs.rm(home,{recursive:true,force:true});}
};
test('source deletion classification distinguishes exclusive, shared and unrelated BRs',()=>{
 const register={sourceDocuments:[{name:'a.pdf',digest:a},{name:'b.pdf',digest:b}],processedSources:[a,b],importDigest:'aggregate',synced:{'BR-001':{key:'DEMO-101',kind:'Epic'},'BR-001/F-001':{key:'DEMO-102',kind:'Feature'},'BR-002':{key:'DEMO-103',kind:'Epic'}},brs:[item('BR-001',[a]),item('BR-002',[a,b]),item('BR-003',[b])]};
 const impact=br.sourceRemovalImpact(register,a);
 assert.deepEqual(impact.exclusive.map(x=>x.brId),['BR-001']);
 assert.deepEqual(impact.shared.map(x=>x.brId),['BR-002']);
 assert.equal(impact.jiraRetirements.length,2);
 assert.equal(impact.jiraNeedsReview.length,1);
});
test('unprocessed source deletion does not retire unrelated approved requirements',()=>{
 const register={sourceDocuments:[{name:'a.pdf',digest:a},{name:'b.pdf',digest:b}],processedSources:[b],importDigest:'aggregate',synced:{},brs:[item('BR-001',[b])]};
 const impact=br.sourceRemovalImpact(register,a);
 assert.equal(impact.impacted.length,0);
});
test('archiving a published BR source preserves approved revision and existing Jira mapping',()=>fixture(async(registry,state)=>{
 state=await br.selectSources(registry,'demo',state.revision,[a]);
 state=await br.discoverySaved(registry,'demo',state.revision,'D1');
 state=await br.reviewed(registry,'demo',state.revision,{discoveryRevision:'D1',text:JSON.stringify({readiness:'Ready',suggestions:[]})});
 const content={title:'Claims',objective:'Process insurance claims',scope:'Claims operations',acceptanceCriteria:'All claims processed',features:[]};
 state=await br.generated(registry,'demo',state.revision,{discoveryRevision:'D1',requirements:[content]});
 state=await br.edit(registry,'demo',state.revision,{brId:'BR-001',content,actor:'BA'});
 state=await br.approve(registry,'demo',state.revision,{brId:'BR-001',actor:'BA'});
 const registerFile=path.join(path.dirname(registry.fileFor('demo')),'documents','requirements','br-register.json');
 const raw=JSON.parse(await fs.readFile(registerFile,'utf8'));
 raw.brs[0].evidence=[{digest:a,verified:true,passage:'Source evidence'}];
 raw.synced['BR-001']={key:'DEMO-101',hash:'trusted-hash',kind:'Epic',title:'Claims',remoteDigest:'trusted-remote'};
 await fs.writeFile(registerFile,JSON.stringify(raw,null,2)+'\n');
 state=await br.load(registry,'demo');
 assert.equal(br.sourceLifecycle(state,a).action,'archive');
 await assert.rejects(br.removeSource(registry,'demo',state.revision,{digest:a}),/Archived or Replaced/);
 const updated=await br.archiveSource(registry,'demo',state.revision,{digest:a});
 assert.equal(updated.brs[0].status,'approved');
 assert.equal(updated.brs[0].needsRefresh,false);
 assert.equal(updated.synced['BR-001'].key,'DEMO-101');
 assert.equal(br.plan(updated).filter(item=>item.action==='retire').length,0);
 assert.equal(updated.archivedSources[0].digest,a);
 await assert.rejects(br.archiveSource(registry,'demo',updated.revision,{digest:a}),/changed or removed/);
}));
test('webview offers archive/delete and restore controls with preserved document selections',()=>{
 const html=read('test/generated/extension-source.txt'),ui=read('media/start.js'),css=read('media/start.css');
 assert.match(html,/id="discoveryImport" class="ba-source-icon-btn" title="Upload Word or PDF"/);
 assert.match(ui,/Delete Everywhere: remove verified linked Jira/);
 assert.match(ui,/deleteBREverywhere/);
 assert.match(html,/id="archivedSources"/);
 assert.match(ui,/function renderArchivedSources\(\)/);assert.doesNotMatch(ui,/Archived & superseded documents/);
 assert.match(ui,/function updateSourceSubmitButton\(\)/);assert.match(ui,/button\.dataset\.action=complete/);
 assert.match(css,/#sourceProcessSubmit:disabled/);
});
test('document archive and restoration are approval-neutral and never auto-modify Jira',()=>{
 const host=read('test/generated/extension-source.txt'),ui=read('media/start.js');
 assert.match(host,/brWorkflow\.sourceLifecycle\(current,digest\)/);
 assert.match(host,/brWorkflow\.archiveSource\(/);
 assert.match(host,/brWorkflow\.restoreSource\(/);
 assert.match(host,/Approved BRs, existing draft work and published Jira issues will be preserved/);
 assert.doesNotMatch(ui,/Archived & superseded documents/);
});
test('stored source removal deletes only the managed upload copy and refuses invalid metadata',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv84-store-'));
 try{
  const registry=new ProjectRegistry(home);await registry.create({id:'demo',name:'Demo'});
  const sourceStore=require('../src/source-store');
  const folder=sourceStore.sourceDirectory(registry,'demo');
  await fs.mkdir(folder,{recursive:true});
  const file=path.join(folder,a+'.pdf');await fs.writeFile(file,'uploaded-copy');
  await assert.rejects(sourceStore.removeStored(registry,'demo',{digest:a,storedName:'../outside.pdf'}),/Invalid stored source/);
  assert.equal((await sourceStore.removeStored(registry,'demo',{digest:a,storedName:a+'.pdf'})).deleted,true);
  assert.equal((await sourceStore.removeStored(registry,'demo',{digest:a,storedName:a+'.pdf'})).deleted,false);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
