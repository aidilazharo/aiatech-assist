'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const complete=require('../src/developer-delivery-completion');
const host=require('node:fs').readFileSync(path.resolve(__dirname,'../test/generated/extension-source.txt'),'utf8');
const client=require('node:fs').readFileSync(path.resolve(__dirname,'../media/start.js'),'utf8');
const head='a'.repeat(40),branch='feature/tc-316-fix-login',now='2026-11-04T03:00:00.000Z';
function fixtures(){
 const issue={fields:{summary:'Add login',updated:now,project:{key:'TC'},assignee:{accountId:'actor'},status:{name:'In Progress',statusCategory:{key:'indeterminate'}}}};
 const repo={root:'/example/repo',branch,sha:head,clean:true};
 const artifacts=['frontend','testing'].map(type=>({type,exists:true,content:'# Task artifact\n\n## Implementation evidence\n\n- See src/login.js and verified work.\n',revision:'v'+type,path:`documents/jira-artifacts/TC-316/${type}.md`}));
 const checks={root:repo.root,branch:repo.branch,head,at:now,targets:[''],results:[{target:'',operation:'test',passed:true,head},{target:'',operation:'build',passed:true,head}]};
 const pr={number:3,head:{ref:branch,sha:head},draft:false,state:'open',user:{id:1},html_url:'https://github.com/example/repo/pull/3',reviews:[{state:'APPROVED',user:{id:2},commit_id:head,submitted_at:now}]};
 return {key:'TC-316',issue,accountId:'actor',projectKey:'TC',repo,files:['src/login.js'],checks,artifacts,requiredTypes:['frontend'],pr,stackApproved:true,accepted:true};
}
test('completion gate requires real Jira owner, approved stack, clean committed code, artifacts, tests, build, PR review and acceptance',()=>{
 const sample=fixtures();const result=complete.evaluate(sample);
 assert.equal(result.ready,true);assert.ok(result.revision);
 const changes=[
  {accountId:'other',gate:'assignment'},
  {stackApproved:false,gate:'stack'},
  {repo:{...sample.repo,clean:false},gate:'branch'},
  {files:[],gate:'source'},
  {artifacts:sample.artifacts.filter(a=>a.type!=='testing'),gate:'artifact:testing'},
  {checks:{...sample.checks,head:'b'.repeat(40)},gate:'tests'},
  {checks:{...sample.checks,results:sample.checks.results.filter(x=>x.operation!=='build')},gate:'build'},
  {pr:null,gate:'review'},
  {accepted:false,gate:'acceptance'},
  {issue:{fields:{...sample.issue.fields,status:{statusCategory:{key:'done'}}}},gate:'jira-status'}
 ];
 for(const changed of changes){const {gate,...updates}=changed;const r=complete.evaluate({...sample,...updates});assert.equal(r.ready,false,gate);assert.equal(r.gates.find(x=>x.id===gate)?.ok,false,gate);}
});
test('unapproved, stale, self-reviewed or draft PR cannot complete a Jira ticket',()=>{
 const sample=fixtures();
 for(const delta of [
  {draft:true},
  {head:{ref:branch,sha:'b'.repeat(40)}},
  {reviews:[]},
  {reviews:[{state:'APPROVED',user:{id:1},commit_id:head,submitted_at:now}]},
  {reviews:[{state:'APPROVED',user:{id:2},commit_id:'b'.repeat(40),submitted_at:now}]},
  {state:'closed',merged_at:null},
  {reviews:[{state:'APPROVED',user:{id:2},commit_id:head,submitted_at:'2026-11-04T02:00:00.000Z'},{state:'CHANGES_REQUESTED',user:{id:2},commit_id:head,submitted_at:now}]}
 ]){
  assert.equal(complete.verifyPullRequest({...sample.pr,...delta},head,branch).ok,false,JSON.stringify(delta));
 }
});
test('artifact selection requires relevant implementation and always includes testing',()=>{
 assert.deepEqual(complete.categories(['backend','testing']),['backend','testing']);
 assert.deepEqual(complete.categories(['integration','frontend']),['frontend','integration','testing']);
 for(const invalid of [[],['testing'],['weapons'],['frontend','frontend'],['frontend','../../']])assert.throws(()=>complete.categories(invalid));
});
test('readiness digest is tied to exact PR, repo head, Jira updated date and verification',()=>{
 const sample=fixtures(),r=complete.evaluate(sample);
 for(const changed of [
  {repo:{...sample.repo,sha:'b'.repeat(40)}},
  {issue:{fields:{...sample.issue.fields,updated:'2026-11-04T04:00:00.000Z'}}},
  {pr:{...sample.pr,number:15}},
  {checks:{...sample.checks,at:'2026-11-04T04:00:00.000Z'}}
 ])assert.notEqual(complete.evaluate({...sample,...changed}).revision,r.revision);
});
test('completion report records precise code/test/PR/BR trace and never asserts deployment',()=>{
 const d=fixtures(),report=complete.reportMarkdown({...d,requiredTypes:['frontend','testing'],actor:'Example Developer',brLinks:['BR-009'],jiraUrl:'https://example.atlassian.net/browse/TC-316'});
 for(const expected of ['TC-316','BR-009','src/login.js','PASS','frontend.md','testing.md',head,'#3'])assert.ok(report.includes(expected),expected);
 assert.match(report,/do not attest to deployment/);
});
test('delivery evidence and report are safely isolated per Jira key and reject symlink parents',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-complete-'));
 try{
  assert.equal(await complete.readJson(dir,'TC-316','verification.json'),null);
  await complete.saveJson(dir,'TC-316','verification.json',{head});
  assert.deepEqual(await complete.readJson(dir,'TC-316','verification.json'),{head});
  const relative=await complete.writeReport(dir,'TC-316','# Report');
  assert.equal(relative,'documents/jira-delivery/TC-316/completion-report.md');
  assert.equal(await fs.readFile(path.join(dir,relative),'utf8'),'# Report');
  await assert.rejects(complete.saveJson(dir,'../X','verification.json',{}),/Invalid Jira/);
  await fs.mkdir(path.join(dir,'documents','jira-delivery'),{recursive:true});
  await fs.symlink(dir,path.join(dir,'documents','jira-delivery','TC-317'));
  await assert.rejects(complete.writeReport(dir,'TC-317','# Bad'),/Unsafe delivery/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Developer page has three explicit completion actions, gates and an explicit remote confirmation',()=>{
 for(const id of ['developerDeliveryPanel','developerDeliveryRunChecks','developerDeliveryVerify','developerDeliveryComplete','developerDeliveryGates','developerDeliveryAcceptance'])assert.match(host,new RegExp(`id="${id}"`));
 for(const command of ['developerDeliveryRunChecks','developerDeliveryPreview','developerDeliveryComplete'])assert.match(host,new RegExp(`case '${command}':`));
 for(const call of ["send('developerDeliveryRunChecks'","send('developerDeliveryPreview'","send('developerDeliveryComplete'"])assert.ok(client.includes(call));
 assert.match(host,/uiWarning\(`Publish evidence/);
 assert.match(host,/fresh\.evaluation\.revision!==details\.evaluation\.revision/);
 assert.match(host,/jiraMove\(config,token,key,done\.id/);
 assert.match(host,/writeConfluence\(config,token/);
});
