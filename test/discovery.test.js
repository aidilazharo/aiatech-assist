'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const discovery=require('../src/ba-discovery');
const {evaluate}=require('../src/continuity');
const {ProjectRegistry}=require('../src/projects');
async function fixture(fn){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-ba-stress-'));
  const reg=new ProjectRegistry(root);
  try{
    await reg.create({id:'claims',name:'Claims',settings:{jira:{projectKey:'CLM'},confluence:{spaceKey:'CLM'}}});
    return await fn(reg,root);
  }finally{await fs.rm(root,{recursive:true,force:true});}
}
const filled=Object.fromEntries(discovery.QUESTIONS.map(([key])=>[key,key==='questions'?'NONE':'Evidence: '+key]));
test('BA discovery has precisely 12 stable non-repeated fields',()=>{
  assert.equal(discovery.QUESTIONS.length,12);
  assert.equal(new Set(discovery.QUESTIONS.map(q=>q[0])).size,12);
  assert.equal(discovery.assess({}).filled,0);
  assert.equal(discovery.assess(filled).filled,12);
});
test('Question 12 can contain genuine open decisions during AI Review, but final BR approval stays gated',()=>{
  const pending={...filled,questions:'TRM sync pending: owner Finance; due date TBD'};
  assert.equal(discovery.assess({}).canReview,false);
  assert.equal(discovery.assess({...filled,questions:'   '}).canReview,false);
  assert.equal(discovery.assess(pending).filled,12);
  assert.equal(discovery.assess(pending).canReview,true,'Unresolved decisions are valid review evidence');
  assert.equal(discovery.assess(pending).needsDecision,true);
  assert.equal(discovery.assess(pending).canApprove,false);
  assert.equal(evaluate(pending,{approved:true}).tasks[0].ready,false,'Cannot approve with unresolved decisions');
  assert.match(evaluate(pending,{approved:true}).tasks[0].blockedBy,/Resolve open decisions/);
  assert.equal(discovery.assess(filled).canReview,true);
  assert.equal(discovery.assess(filled).canApprove,true);
  assert.equal(discovery.noOpenDecisions('NONE.'),true,'Legacy saved answers still work');
  assert.equal(discovery.noOpenDecisions('No open decisions'),true);
  assert.equal(discovery.noOpenDecisions('None except TRM sync'),false);
  assert.equal(evaluate(filled).tasks[0].ready,false,'Human approval remains mandatory');
  assert.equal(evaluate(filled,{approved:true}).tasks[0].ready,true);
  assert.equal(evaluate(filled,{approved:true}).tasks[4].ready,false,'Cannot auto-authorize implementation');
});
test('independent readiness allows planning while architecture is blocked',()=>{
  const out=evaluate({problem:'Need service',scope:'Limited service'});
  assert.equal(out.tasks.find(t=>t.id==='planning').ready,true);
  assert.equal(out.tasks.find(t=>t.id==='architecture').ready,false);
  assert.equal(out.tasks.find(t=>t.id==='acceptance-tests').ready,false);
});
test('discovery saves and reloads exact answers without creating a Jira ticket',()=>fixture(async(reg,root)=>{
  const original=await discovery.load(reg,'claims');
  const saved=await discovery.save(reg,'claims',filled,original.revision);
  assert.equal(saved.readiness.filled,12);
  assert.equal(saved.answers.problem,filled.problem);
  const list=await fs.readdir(path.join(root,'projects','claims','documents','requirements'));
  assert.deepEqual(list.sort(),['discovery-12.json','discovery-12.md']);
  const markdown=await fs.readFile(path.join(root,'projects','claims','documents','requirements','discovery-12.md'),'utf8');assert.match(markdown,/12 discovery questions/);assert.match(markdown,/Evidence: problem/);
  assert.equal((await discovery.load(reg,'claims')).revision,saved.revision);
}));
test('stale writer cannot overwrite a more recent discovery revision',()=>fixture(async reg=>{
  const a=await discovery.load(reg,'claims');
  await discovery.save(reg,'claims',{problem:'first'},a.revision);
  await assert.rejects(discovery.save(reg,'claims',{problem:'stale'},a.revision),/changed on disk/);
  assert.equal((await discovery.load(reg,'claims')).answers.problem,'first');
}));
test('untrusted answer types or oversized answer content rejected',()=>fixture(async reg=>{
  const a=await discovery.load(reg,'claims');
  await assert.rejects(discovery.save(reg,'claims',{problem:{unexpected:true}},a.revision),/Invalid answer/);
  await assert.rejects(discovery.save(reg,'claims',{scope:'X'.repeat(100001)},a.revision),/Invalid answer/);
}));
test('symlinked discovery file and folder are rejected',()=>fixture(async(reg,root)=>{
  const dir=path.join(root,'projects','claims','documents','requirements');
  await fs.mkdir(dir,{recursive:true});
  const secret=path.join(root,'untouched-secret.txt');await fs.writeFile(secret,'secret');
  await fs.symlink(secret,path.join(dir,'discovery-12.json'));
  await assert.rejects(discovery.load(reg,'claims'),/symlink/);
  await assert.rejects(discovery.save(reg,'claims',{problem:'overwrite'},'x'),/symlink/);
  assert.equal(await fs.readFile(secret,'utf8'),'secret');
  await fs.unlink(path.join(dir,'discovery-12.json'));
  await fs.rm(dir,{recursive:true});await fs.symlink(root,dir);
  await assert.rejects(discovery.load(reg,'claims'),/symlink/);
}));
test('discovery cannot read another project through invalid ID',()=>fixture(async reg=>{
  await assert.rejects(discovery.load(reg,'../another'),/Invalid|project|id/i);
}));
test('webview-only presentation keeps only two commands and uses provider-agnostic AI routing',()=>{
  const pkg=require('../package.json');
  assert.deepEqual(pkg.contributes.commands.map(c=>c.title),['ATGV: Start','ATGV: Workspace','ATGV: AI','ATGV: Refresh Shared Project Artifacts','ATGV: Restart','ATGV: Reset','ATGV: Report an Issue']);
  assert.equal(pkg.contributes.viewsContainers,undefined);
  const ext=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
  for(const id of ['workbench.action.closeSidebar','workbench.action.closePanel','workbench.action.closeAuxiliaryBar'])assert.ok(ext.includes(id));
  assert.match(ext,/activeAiTarget\(\)/);
  assert.match(require('node:fs').readFileSync(path.join(__dirname,'../src/ai-models.js'),'utf8'),/selectChatModels\(\)/);
  assert.ok(!ext.includes('chat.disableAIFeatures'));
});
