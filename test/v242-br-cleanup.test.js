'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const cleanup=require('../src/br-artifact-cleanup'),projectUX=require('../src/project-ux-prototype'),remote=require('../src/remote-br-deletion');
const src=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const key='TC-392',other='TC-411';
function register(){return {brs:[{id:'BR-005',status:'approved',approvedContent:{features:[{id:'F-1',title:'Dashboard',stories:[{id:'S-1',title:'Monitoring Dashboard'}]}]}}],
 synced:{'BR-005':{key:'TC-390',marker:'atgv-'+'a'.repeat(24),remoteDigest:'sha'},'BR-005/F-1':{key:'TC-391',marker:'atgv-'+'b'.repeat(24),remoteDigest:'sha'},'BR-005/F-1/S-1':{key,marker:'atgv-'+'c'.repeat(24),remoteDigest:'sha'}},
 roleTaskMappings:{'BR-005/F-1/S-1/ROLE-UIUX':{key:'TC-413',marker:'atgv-'+'d'.repeat(24),roleLabel:'atgv-role-ux-designer',storyKey:key,parentKey:'TC-391'}}};}
test('in-progress button reads Delete and retains the verified Delete Everywhere workflow',()=>{
 assert.ok(src.includes('id="baDeleteIncomplete" class="danger" type="button" data-br-delete-action>Delete</button>'));
 assert.ok(!src.includes('id="baDeleteIncomplete" class="danger" type="button" data-br-delete-action>Force Delete Everywhere</button>'));
 const start=ui.indexOf("$('baDeleteIncomplete').addEventListener('click'");const end=ui.indexOf("$('baRestartIncomplete').addEventListener('click'",start),part=ui.slice(start,end);
 assert.match(part,/requestBRDeletion\(\{target:'in-progress',revision:brState\.revision\}\)/);
 assert.match(src,/case 'deleteEmptyIncompleteCycle'/);
});
test('removes repair-generated Jira subtasks before parent and checks role marker',()=>{
 const reg=register();const plan=remote.getJiraRows(reg,['BR-005'],{get:k=>k==='jira.projectKey'?'TC':null});
 assert.equal(plan[0].key,'TC-413');assert.equal(plan[0].roleVerifiedLegacy,true);
 const row=plan[0],remoteIssue={key:row.key,fields:{project:{key:'TC'},issuetype:{name:'Sub-task'},parent:{key:'TC-391'},labels:[row.marker,row.roleLabel],summary:row.expectedSummary}};
 assert.doesNotThrow(()=>remote.assertJiraIdentity(row,remoteIssue));
 assert.throws(()=>remote.assertJiraIdentity(row,{...remoteIssue,fields:{...remoteIssue.fields,summary:'Changed externally'}}),/changed outside/);
 reg.roleTaskPending={'BR-005/F-1/S-1/ROLE-QA':{attempted:true}};
 assert.throws(()=>remote.assertRegister(reg,['BR-005']),/pending|Pending/i);
});
test('cross-BR Jira mapping protection blocks cleanup',()=>{
 const reg=register();reg.synced['BR-006/S-1']={key:'TC-413'};
 assert.throws(()=>cleanup.ownership(reg,['BR-005']),/shared/);
});
test('only identified Jira-keyed design and Developer artifacts are removed; other Story preserved',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-clean-'));
 try{
  await fs.mkdir(path.join(root,'documents','project-prototype'),{recursive:true});
  for(const k of [key,other])for(const d of ['jira-designs','jira-artifacts','jira-delivery']){
   const folder=path.join(root,'documents',d,k);await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'test.txt'),k);
  }
  await fs.writeFile(path.join(root,'documents','project-prototype','preview-'+key+'.html'),'preview');
  // Ensure manifest-backed contributions are removed by Jira key, not wiped globally.
  const screens=(k)=>({key:k,exists:true,status:'approved',revisionNumber:1,sourceStoryKey:k,prototype:{screens:[{name:'Screen '+k,components:[],interactions:[]}]}});
  await projectUX.update(root,screens(key));await projectUX.update(root,screens(other));
  const output=await cleanup.cleanup(root,{keys:[key]});assert(output.removed.length>=4);
  assert.equal((await fs.readdir(path.join(root,'documents','jira-designs'))).includes(key),false);
  assert.equal((await fs.readdir(path.join(root,'documents','jira-designs'))).includes(other),true);
  const manifest=await projectUX.load(root);assert(!manifest.tickets[key]);assert(manifest.tickets[other]);
  await cleanup.cleanup(root,{keys:[key]});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('symlink inside a ticket artifact folder fails closed rather than escaping project',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-clean-symlink-'));
 try{
  const folder=path.join(root,'documents','jira-designs',key);await fs.mkdir(folder,{recursive:true});
  await fs.symlink(os.tmpdir(),path.join(folder,'foreign'));
  await assert.rejects(cleanup.cleanup(root,{keys:[key]}),/Unsafe|symlink|Symlink/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('original uploaded source is removed only when its verified evidence belongs exclusively to deleted BR',()=>{
 const flow=require('../src/br-workflow'),digest='a'.repeat(64),source={digest,name:'person.pdf',storedName:digest+'.pdf'};
 const br={id:'BR-005',evidence:[{digest,verified:true}]},reg={brs:[br],sourceDocuments:[source]};
 assert.equal(flow.exclusiveBRSourceEntries(reg,['BR-005']).length,1);
 reg.brs.push({id:'BR-006',evidence:[{digest,verified:true}]});
 assert.equal(flow.exclusiveBRSourceEntries(reg,['BR-005']).length,0);
});
test('historical published cycles prevent ambiguous source removal',()=>{
 const flow=require('../src/br-workflow'),digest='a'.repeat(64);
 const reg={brs:[{id:'BR-005',evidence:[{digest,verified:true}]}],sourceDocuments:[{digest,name:'source.pdf'}],
 completedCycles:[{sources:[{digest,name:'source.pdf'}],requirements:[{id:'BR-006',sourceName:'source.pdf'}]}]};
 assert.equal(flow.exclusiveBRSourceEntries(reg,['BR-005']).length,0);
});
test('deleted Jira effort estimates are removed without disturbing other tasks or project deadline',async()=>{
 const effort=require('../src/project-effort-register');
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-effort-'));
 const registry={fileFor:()=>path.join(home,'project.json')};
 try{
  const current=await effort.load(registry,'project');
  await effort.approve(registry,'project',{projectKey:'TC',entries:[{key:'TC-392',md:4},{key:'TC-410',md:8}],actor:'PM',expectedRevision:current.revision});
  const cleaned=await effort.removeBRTaskEstimates(registry,'project',{jiraKeys:['TC-392'],actor:'BA'});
  assert.deepEqual(cleaned.removed,['TC-392']);
  const state=await effort.load(registry,'project');assert.equal(state.estimates['TC-410'],8);assert.equal(state.estimates['TC-392'],undefined);
  assert.equal((await effort.removeBRTaskEstimates(registry,'project',{jiraKeys:['TC-392']})).removed.length,0);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
