'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ProjectActivitySync,projectKey,pageTitle,empty,encode,decode,merge,contextText}=require('../src/project-activity-sync');

const cfg={get:key=>({
 'jira.baseUrl':'https://example.atlassian.net',
 'confluence.baseUrl':'https://example.atlassian.net/wiki',
 'confluence.spaceKey':'TEST',
 'jira.email':'ba@example.com',
 'jira.projectKey':'TC'
}[key]||'')};
function harness(){
 let saved=null,version=0,createCount=0,writeCount=0,conflicts=0;
 const request=async(url,options={})=>{
  if(url.endsWith('/rest/api/3/myself'))return {accountId:'account-abc',displayName:'Verified BA'};
  if(url.includes('/rest/api/3/search/jql'))return {issues:[
   {key:'TC-100',fields:{status:{name:'In Progress',statusCategory:{key:'indeterminate'}},summary:'Implement API',assignee:{displayName:'Developer A'},updated:'2026-11-21T10:00:00Z'}},
   {key:'WRONG-8',fields:{status:{name:'In Progress',statusCategory:{key:'indeterminate'}},summary:'Other project'}}
  ]};
  if(url.includes('/api/v2/pages?'))return {results:saved?[{id:'55',title:pageTitle('TC'),status:'current'}]:[]};
  if(url.includes('/api/v2/pages/55?'))return {id:'55',spaceId:'10',title:pageTitle('TC'),
   version:{number:version},body:{storage:{value:saved}}};
  if(options.method==='POST'&&url.endsWith('/api/v2/pages')){
   if(saved)throw Error('HTTP 409 duplicate page');
   createCount++;saved=options.data.body.value;version=1;return {id:'55'};
  }
  if(options.method==='PUT'&&url.endsWith('/api/v2/pages/55')){
   writeCount++;
   if(conflicts){conflicts--;throw Error('HTTP 409 concurrent update');}
   if(options.data.version.number!==version+1)throw Error('HTTP 409 version conflict');
   saved=options.data.body.value;version++;return {id:'55'};
  }
  throw Error('Unexpected request '+url);
 };
 const store=()=>new ProjectActivitySync({config:cfg,token:'test-token',project:'TC',request,
  spaceProvider:async()=>({id:'10',key:'TEST'})});
 return {store,request,get saved(){return saved;},get createCount(){return createCount;},
  get writeCount(){return writeCount;},setConflict:n=>{conflicts=n;}};
}
test('validates scoped project identity and refuses forged Confluence page marker',()=>{
 assert.equal(projectKey('tc'),'TC');
 assert.throws(()=>projectKey('TC; DELETE'),/valid Jira project key/);
 assert.throws(()=>decode('<p>external content</p>','TC'),/not an ATGV-managed/);
 const page=encode(empty('TC'));
 assert.deepEqual(decode(page,'TC'),empty('TC'));
 assert.throws(()=>decode(page,'OTHER'),/identity or schema mismatch/);
});
test('activity merge is idempotent and tracks verified actor metadata',()=>{
 const initial=empty('TC');
 const events=[{type:'br_changed',subject:'BR-001',status:'draft',title:'New BR',revision:'v1',role:'business-analyst'}];
 const first=merge(initial,events,{id:'account-abc',name:'Verified BA'},'2026-11-21T10:00:00Z');
 assert.equal(first.changed,1);
 assert.equal(first.state.records['BR-001'].actorId,'account-abc');
 const again=merge(first.state,events,{id:'account-abc',name:'Verified BA'},'2026-11-21T10:01:00Z');
 assert.equal(again.changed,0);
 assert.equal(again.state.events.length,1);
});
test('creates one project page, retries 409 conflicts and retains all role updates',async()=>{
 const mock=harness(),a=mock.store(),b=mock.store();
 await a.append({type:'br_changed',subject:'BR-001',status:'draft',title:'Payment rules',revision:'r1',role:'business-analyst'});
 assert.equal(mock.createCount,1);
 mock.setConflict(1);
 await b.append({type:'development_started',subject:'TC-100',status:'started',title:'Implement API',revision:'feature/TC-100',role:'software-developer'});
 assert.ok(mock.writeCount>=2);
 await a.append({type:'br_changed',subject:'BR-001',status:'draft',title:'Payment rules',revision:'r1',role:'business-analyst'});
 const activity=await b.awareness();
 assert.equal(activity.confluenceAvailable,true);
 assert.equal(activity.jiraAvailable,true);
 assert.deepEqual(activity.incompleteBRs.map(x=>x.subject),['BR-001']);
 assert.deepEqual(activity.inProgress.map(x=>x.key),['TC-100']);
 assert.equal(activity.inProgress[0].developmentConfirmed,true);
 assert.equal(activity.recentActivity.length,2);
 assert.equal(mock.createCount,1);
 assert.match(contextText(activity),/BR-001/);
});
test('does not treat Jira in-progress alone as a confirmed ATGV development start',async()=>{
 const state=await harness().store().awareness();
 assert.equal(state.confluenceAvailable,true);
 assert.equal(state.inProgress.length,1);
 assert.equal(state.inProgress[0].developmentConfirmed,false);
});
test('rejects invalid activity subjects and batches',async()=>{
 const service=harness().store();
 await assert.rejects(service.append({type:'br_changed',subject:'../../secrets',status:'draft'}),/Invalid activity subject/);
 await assert.rejects(service.appendMany([]),/Invalid project activity batch/);
});
