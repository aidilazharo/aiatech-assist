'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {diagnosticContext}=require('../src/project-artifacts');
const {parseQuality,qualityPrompt}=require('../src/ba-automatic-workflow');
test('all roles receive bounded, project-local diagnostic metadata with credentials redacted',async()=>{
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-role-logs-')),root=path.join(parent,'sample-project'),logs=path.join(root,'artifacts','logs');
 try{
  await fs.mkdir(logs,{recursive:true});
  const event=details=>({at:'2026-11-28T14:02:00.000Z',stage:'workflow',action:'validate',status:'failed',details});
  for(const role of ['business-analyst','project-manager','uat-tester','compliance-officer','custom-reviewer']){
   await fs.writeFile(path.join(logs,role+'.json'),JSON.stringify({projectId:'sample-project',role,records:[event(role+' failure password=never-send-me')]}));
  }
  await fs.writeFile(path.join(logs,'software-developer.json'),JSON.stringify({projectId:'different-project',role:'software-developer',records:[event('CROSS_PROJECT_PRIVATE')]}));
  await fs.writeFile(path.join(logs,'workflow-jobs.json'),JSON.stringify({projectId:'sample-project',records:[{role:'ux-designer',status:'reconcile-required',command:'design',error:'Interrupted design checkpoint',updatedAt:'2026-11-28T14:03:00.000Z'}]}));
  for(const role of ['business-analyst','project-manager','solution-architect','ux-designer','software-developer','qa-engineer','uat-tester','product-owner','security-engineer','data-engineer','technical-writer','release-manager','operations-support','technical-lead','scrum-master','business-owner','ai-ml-engineer','compliance-officer','custom-reviewer']){
   const prompt=await diagnosticContext(root,'sample-project',{role,baEvents:[event('BR-011 verification failed')],stackPriorities:[{label:'Windows EPERM',count:2}]});
   assert.match(prompt,/BR-011 verification failed/);assert.match(prompt,/Interrupted design checkpoint/);assert.match(prompt,/custom-reviewer failure/);assert.match(prompt,/Windows EPERM/);
   assert.match(prompt,/untrusted reference data/);assert.ok(!prompt.includes('never-send-me'));assert.ok(!prompt.includes('CROSS_PROJECT_PRIVATE'));assert.ok(prompt.length<9000);assert.ok(prompt.includes('"role":"'+role+'"'));
  }
  assert.equal(await diagnosticContext(root,'different-project'),'');
 }finally{await fs.rm(parent,{recursive:true,force:true});}
});
test('BR quality validator produces specific safe retry feedback and still rejects invalid evidence',()=>{
 const drafts=[{id:'BR-011',title:'Verified requirement title',objective:'Exact source grounded objective',scope:'Specific authorized scope',acceptanceCriteria:'Measurable acceptance criterion',work:[]}],concerns=[];
 assert.deepEqual(parseQuality('{"excluded":[]}',drafts,concerns),[]);
 assert.throws(()=>parseQuality('not JSON',drafts,concerns),/valid JSON object/);
 assert.throws(()=>parseQuality(JSON.stringify({excluded:[{id:'BR-999',quote:'Exact source grounded objective',reason:'Issue'}]}),drafts,concerns),/outside the input drafts/);
 assert.throws(()=>parseQuality(JSON.stringify({excluded:[{id:'BR-011',quote:'invented quotation',reason:'Issue'}]}),drafts,concerns),/exact substring/);
 assert.throws(()=>parseQuality(JSON.stringify({excluded:[{id:'BR-011',quote:'Exact source grounded objective',reason:'Issue',conflict:2}]}),drafts,concerns),/unknown source conflict/);
 assert.equal(parseQuality(JSON.stringify({excluded:[{id:'BR-011',quote:'Exact source grounded objective',reason:'Issue',conflict:null}]}),drafts,concerns)[0].field,'Business purpose');
 assert.match(qualityPrompt(drafts,concerns,''),/at most one finding per draft/);
});
test('role chat and automatic quality retries use the diagnostic gateway',async()=>{
 const runtime=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(runtime,/projectDiagnosticArtifacts\.diagnosticContext\(root,projectId/);
 assert.match(runtime,/aiAnswer\(target,prompt,7000,\{diagnosticRole:roleId,projectRole:role,system:rag\.system/);
 assert.match(runtime,/Previous response was rejected by the host validator/);
 assert.match(runtime,/quality review failed validation after 3 attempts/);
 assert.match(runtime,/aiDiagnosticProjects\.get\(target\)!==projectId/);
});
