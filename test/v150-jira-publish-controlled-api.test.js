'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const code=source.slice(source.indexOf('async function syncApprovedBRs(expectedRevision){'),source.indexOf('\nlet aiChangeResolutionRuntime=null;'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function setup({failCreate=false,approval='Publish Jira'}={}){
 const item={path:'BR-777',action:'create',kind:'Epic',title:'Controlled test Epic',description:'Mock only',hash:'fixed-hash',parent:null};
 let state={revision:1,brs:[{id:'BR-777',status:'approved'}],synced:{},pending:{},inboundJira:[]};
 const messages=[],writes=[];
 const config={get:key=>key==='jira.projectKey'?'TC':null};
 const binding=JSON.stringify({atgvProjectId:'test-project',site:'https://mock.atlassian.test',project:'TC',actor:'mock-actor',items:[item]});
 const deps={
  jiraSyncBusy:false,approvedJiraPreviewRevision:1,approvedJiraPreviewBinding:sha(binding),activeProject:{id:'test-project'},registry:{},
  requireOnline(){}, effectiveConfig(){return config;},getAtlassianToken:async()=> 'unused-token',
  verifiedBAActor:async()=> 'mock-actor',sha,baseAtlassian:()=> 'https://mock.atlassian.test',
  prePublishIdentityGuard:async()=>({safe:true}),jiraPreflight:async()=>[],jiraIssueTypes:async()=>[{name:'Epic',subtask:false}],
  jiraProtectionAssessment:async()=>({blocked:[]}),jiraScopedMarker:()=> 'atgv-'+'a'.repeat(24),
  jiraFindIssueByMarker:async()=>null,
  jiraCreateIssue:async()=>{writes.push('create');if(failCreate)throw new Error('Injected Jira network failure');return {key:'TC-999'};},
  jiraReadIssue:async()=>({key:'TC-999',fields:{issuetype:{name:'Epic'},summary:item.title,description:item.description}}),
  jiraUpdateIssue:async()=>{throw Error('Unexpected UPDATE');},jiraRetireIssue:async()=>{throw Error('Unexpected RETIRE');},
  remoteFingerprint:()=> 'remote-trusted-digest',
  uiWarning:async()=>approval,notice:async()=>{},
  dashboard:{webview:{postMessage:async message=>{messages.push(message);}}},
  brWorkflow:{
   load:async()=>state,plan:()=>[item],
   beginOperation:async()=>{state={...state,revision:state.revision+1,pending:{...state.pending,[item.path]:{action:'create',hash:item.hash}}};return state;},
   markAttempt:async()=>{state={...state,revision:state.revision+1,pending:{...state.pending,[item.path]:{...state.pending[item.path],previousAttempt:true}}};return state;},
   recorded:async(_r,_id,_rev,args)=>{writes.push('recorded');state={...state,revision:state.revision+1,synced:{...state.synced,[args.path]:{key:args.key,kind:args.kind}},pending:{}};return state;},
   finishChangeRequest:async()=>{writes.push('finalized');state={...state,revision:state.revision+1};return state;}
  }
 };
 const run=new Function('deps',`with(deps){${code}\nreturn syncApprovedBRs;}`)(deps);
 return {run,messages,writes,deps,getState:()=>state};
}
test('real publisher function reports confirmed progress only after local state is recorded',async()=>{
 const t=setup();await t.run(1);
 assert.deepEqual(t.writes,['create','recorded','finalized']);
 const progress=t.messages.filter(m=>m.type==='brJiraPublishProgress');
 assert.deepEqual(progress.map(m=>m.phase),['preparing','publishing','publishing','publishing','verifying','completed']);
 assert.equal(progress[0].confirmed,0);
 assert.equal(progress.find(m=>m.currentKey==='TC-999').confirmed,1);
 assert.equal(progress.at(-1).confirmed,1);
 assert.equal(progress.at(-1).total,1);
 assert.equal(t.messages.filter(m=>m.type==='brJiraDone').length,1);
 assert.equal(t.getState().synced['BR-777'].key,'TC-999');
});
test('failed CREATE never claims confirmed completion or sends a success event',async()=>{
 const t=setup({failCreate:true});
 await assert.rejects(t.run(1),/Injected Jira network failure/);
 assert.deepEqual(t.writes,['create']);
 const progress=t.messages.filter(m=>m.type==='brJiraPublishProgress');
 assert.equal(progress.at(-1).phase,'failed');
 assert.equal(progress.at(-1).confirmed,0);
 assert.equal(t.messages.filter(m=>m.type==='brJiraDone').length,0);
 assert.equal(t.getState().pending['BR-777'].previousAttempt,true);
});
test('cancelled publish never invokes the Jira create API',async()=>{
 const t=setup({approval:'Cancel'});await t.run(1);
 assert.deepEqual(t.writes,[]);
 assert.equal(t.messages.filter(m=>m.type==='brJiraPublishProgress').at(-1).phase,'cancelled');
});
