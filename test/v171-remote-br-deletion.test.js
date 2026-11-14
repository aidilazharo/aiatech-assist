'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const remote=require('../src/remote-br-deletion');
const {remoteFingerprint}=require('../src/remote-actions');

const projectId='cockpit';
const site='https://example.atlassian.net';
const config={get(key){return {
 'jira.baseUrl':site,'jira.projectKey':'TC','jira.email':'admin@example.com',
 'confluence.baseUrl':site+'/wiki','confluence.spaceKey':'TCC','confluence.spaceId':'321'
}[key]||'';}};
function fixture(){
 const issue=(key,parentKey='',marker='atgv-'+key.slice(-3).padStart(24,'0'))=>({key,fields:{summary:'Test '+key,description:null,project:{key:'TC'},labels:[marker],issuetype:{name:key==='TC-100'?'Epic':'Subtask'},parent:parentKey?{key:parentKey}:null}});
 const first=issue('TC-100'),second=issue('TC-101','TC-100');
 const issues={'TC-100':first,'TC-101':second};
 const state={revision:'state-1',brs:[{id:'BR-001',title:'Visitor registration'},{id:'BR-002',title:'Equipment loans'}],synced:{
  'BR-001':{key:'TC-100',issueType:'Epic',marker:first.fields.labels[0],remoteDigest:remoteFingerprint(first)},
  'BR-001/F-001':{key:'TC-101',issueType:'Subtask',marker:second.fields.labels[0],remoteDigest:remoteFingerprint(second)}
 },pending:{},changeQueue:[]};
 const page={id:'555',spaceId:'321',status:'current',title:'ATGV Visitor Registration',version:{number:2}};
 const calls=[];
 const request=async(url,opts)=>{
  calls.push({url,method:opts.method||'GET'});
  if(url.endsWith('/search/jql')){
   const key=opts.data.jql.match(/parent = ([A-Z]+-\d+)/)[1];
   return {issues:key==='TC-100'&&issues['TC-101']?[{key:'TC-101'}]:[],isLast:true};
  }
  if(url.includes('/children?'))return {results:[]};
  if(opts.method==='DELETE'){
   if(url.includes('/issue/')){const key=url.match(/\/issue\/([A-Z]+-\d+)/)[1];delete issues[key];}
   return {};
  }
  throw Error('Unexpected HTTP request: '+url);
 };
 return {state,issues,first,second,page,calls,request,readJira:async(c,t,key)=>{if(!issues[key])throw Error('HTTP 404');return issues[key];},getPage:async()=>page,getSpace:async()=>({id:'321'}),readLinks:async()=>({entries:{'approved-brs/BR-001.md':{pageId:'555',spaceId:'321',title:page.title,version:2}}})};
}
async function runFixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-delete-everywhere-'));try{return await fn({registry:{fileFor:id=>path.join(root,id,'project.json')},root});}finally{await fs.rm(root,{recursive:true,force:true});}}

test('preflight verifies exact Jira identities, descendants, Confluence page and read-only APIs',async()=>{
 const f=fixture();const plan=await remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp/irrelevant',...f});
 assert.deepEqual(plan.jira.map(x=>x.key),['TC-101','TC-100']);
 assert.deepEqual(plan.confluence.map(x=>x.pageId),['555']);
 assert.equal(f.calls.filter(x=>x.method==='DELETE').length,0);
 assert.equal(plan.brIds[0],'BR-001');
});

test('preflight rejects shared, unmarked, unmapped, or changed Jira issue identities',async()=>{
 const f=fixture();
 f.state.synced['BR-002/F-001']={key:'TC-101'};
 await assert.rejects(remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f}),/linked more than once|shared by an unrelated/);
 delete f.state.synced['BR-002/F-001'];
 f.issues['TC-101'].fields.labels=['not-atgv'];
 await assert.rejects(remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f}),/marker/);
 f.issues['TC-101'].fields.labels=[f.state.synced['BR-001/F-001'].marker];
 f.issues['TC-101'].fields.summary='Unexpected external edit';
 await assert.rejects(remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f}),/changed outside ATGV/);
});

test('preflight blocks unmapped child and Confluence child page',async()=>{
 const f=fixture();
 const unknown=async(url,opts)=>url.endsWith('/search/jql')?{issues:[{key:'TC-999'}],isLast:true}:f.request(url,opts);
 await assert.rejects(remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f,request:unknown}),/unmapped child/);
 const badChildren=async(url,opts)=>url.includes('/children?')?{results:[{id:'987'}]}:f.request(url,opts);
 await assert.rejects(remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f,request:badChildren}),/child content/);
});

test('Delete Everywhere journals successful calls, handles a definite remote rejection, and resumes without repeating deletes',()=>runFixture(async({registry})=>{
 const f=fixture();
 const plan=await remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f});
 const job=remote.createJob(plan,'Test BA');
 await remote.saveJobs(registry,projectId,{schema:1,jobs:[job]});
 let blocked=true,finalized=0;
 const request=async(url,opts)=>{
  if(url.endsWith('/issue/TC-101?deleteSubtasks=false')&&blocked){blocked=false;throw Error('HTTP 403 from Atlassian: Delete Issues permission required');}
  return f.request(url,opts);
 };
 const args={registry,projectId,job,config,token:'FAKE',loadRegister:async()=>f.state,finalize:async()=>{finalized++;},request,readJira:f.readJira,getPage:f.getPage,getSpace:f.getSpace};
 await assert.rejects(remote.execute(args),/HTTP 403/);
 let journal=await remote.readJobs(registry,projectId);
 assert.equal(journal.jobs[0].results['confluence:555'].status,'deleted');
 assert.equal(journal.jobs[0].results['jira:TC-101'].status,'failed');
 assert.equal(finalized,0);
 assert.deepEqual(remote.unresolvedJob(journal,['BR-001']).brIds,['BR-001']);
 const result=await remote.execute(args);
 assert.equal(result.status,'completed');
 assert.equal(finalized,1);
 assert.deepEqual(f.calls.filter(x=>x.method==='DELETE').map(x=>x.url.includes('/issue/')?'Jira':'Confluence'),['Confluence','Jira','Jira']);
 journal=await remote.readJobs(registry,projectId);
 assert.equal(journal.jobs[0].status,'completed');
}));

test('uncertain remote delete attempts are blocked from automatic retry',()=>runFixture(async({registry})=>{
 const f=fixture();const plan=await remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f});
 const job=remote.createJob(plan,'BA');job.results['jira:TC-101']={status:'attempting'};
 await remote.saveJobs(registry,projectId,{schema:1,jobs:[job]});
 await assert.rejects(remote.execute({registry,projectId,job,config,token:'FAKE',loadRegister:async()=>f.state,finalize:async()=>{},...f}),/interrupted delete attempt/);
}));

test('all Delete controls route to the verified remote path',async()=>{
 const start=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const extension=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(start,/deleteBREverywhere/);
 assert.match(start,/Delete Everywhere/);
 assert.doesNotMatch(start,/forceDeletePublishedBR/);
 assert.doesNotMatch(start,/deleteUploadedDiscoverySource/);
 assert.match(extension,/case 'deleteBREverywhere'/);
 assert.match(extension,/DELETE EVERYWHERE/);
 assert.match(extension,/remoteBRDeletion\.execute/);
});

test('remote deletion audit distinguishes deleted remote records from local-only deletion',()=>runFixture(async({root,registry})=>{
 const br=require('../src/br-workflow');
 const {ProjectRegistry}=require('../src/projects');
 const realRegistry=new ProjectRegistry(root);
 await realRegistry.create({id:projectId,name:'Cockpit'});
 let r=await br.load(realRegistry,projectId);
 r=await br.imported(realRegistry,projectId,r.revision,{name:'visitor.pdf',digest:'a'.repeat(64)});
 r=await br.discoverySaved(realRegistry,projectId,r.revision,'revision-1');
 r=await br.reviewed(realRegistry,projectId,r.revision,{discoveryRevision:'revision-1',text:'Reviewed'});
 const example={title:'Visitor request',objective:'Manage visitors',scope:'Visitor entry and approval',acceptanceCriteria:'A visitor can request approval',features:[]};
 r=await br.generated(realRegistry,projectId,r.revision,{discoveryRevision:'revision-1',requirements:[example]});
 const id=r.brs[0].id;
 const jobId='11111111-1111-1111-1111-111111111111';
 r=await br.forceDeleteBusinessRequirement(realRegistry,projectId,r.revision,{brId:id,expectedJiraKeys:[],remoteDeletionJobId:jobId});
 assert.equal(r.deletedRequirements[0].remoteRecordsPreserved,false);
 assert.equal(r.deletedRequirements[0].remoteDeletionJobId,jobId);
 assert.equal(r.brs.length,0);
}));


test('reparented marker-owned Jira issue can be deleted after visible preview without deleting an unrelated parent',()=>runFixture(async({registry})=>{
 const f=fixture();
 f.issues['TC-101'].fields.parent={key:'TC-900'};
 const plan=await remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f});
 const moved=plan.jira.find(x=>x.key==='TC-101');
 assert.equal(moved.parentChanged,true);
 assert.equal(moved.parentKey,'TC-100');
 assert.equal(moved.observedParentKey,'TC-900');
 const job=remote.createJob(plan,'BA');await remote.saveJobs(registry,projectId,{schema:1,jobs:[job]});
 let finalized=false;const completed=await remote.execute({registry,projectId,job,config,token:'FAKE',loadRegister:async()=>f.state,finalize:async()=>{finalized=true;},...f});
 assert.equal(completed.status,'completed');assert.equal(finalized,true);
 assert.equal(f.calls.filter(c=>c.method==='DELETE'&&c.url.includes('/issue/')).length,2);
 assert.ok(f.calls.every(c=>!c.url.includes('/issue/TC-900')));
}));

test('parent changed again after Delete Everywhere preview is blocked before remote writes',()=>runFixture(async({registry})=>{
 const f=fixture();f.issues['TC-101'].fields.parent={key:'TC-900'};
 const plan=await remote.preflight({register:f.state,brIds:['BR-001'],config,token:'FAKE',projectId,folder:'/tmp',...f});
 const job=remote.createJob(plan,'BA');await remote.saveJobs(registry,projectId,{schema:1,jobs:[job]});
 f.issues['TC-101'].fields.parent={key:'TC-901'};
 // Existing logic deletes linked Confluence page before Jira. This exception
 // must at minimum occur before attempting DELETE of the changed Jira issue.
 await assert.rejects(remote.execute({registry,projectId,job,config,token:'FAKE',loadRegister:async()=>f.state,finalize:async()=>{},...f}),/parent changed after deletion preview/);
 assert.equal(f.calls.filter(c=>c.method==='DELETE'&&c.url.includes('/issue/')).length,0);
}));
