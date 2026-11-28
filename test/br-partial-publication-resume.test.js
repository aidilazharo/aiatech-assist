'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
const start=source.indexOf('async function publishPreparedBRs('),end=source.indexOf('async function prepareBRJiraPreview(',start);
const code=source.slice(start,end);
function harness({confirm=true,blocked=false}={}){
 let remaining=[{path:'BR-015/F-001/S-002',action:'create'}];
 const register={revision:'r',brs:[{id:'BR-015',status:'approved',approvedContent:{}}],synced:{'BR-015':{key:'TC-856',issueId:'1'}},completedCycles:[]};
 const calls=[],plans={a:1},sha=JSON.stringify,config={get:()=> 'TC'};
 const sessions=new Map([['p',{phase:'ready',preview:{revision:'r',projectId:'p',conflicts:[],verifiedAt:1,fieldPlansHash:'old'}}]]);
 const refreshed={projectId:'p',revision:'r',conflicts:blocked?['Jira permissions unavailable']:[],verifiedAt:Date.now(),fieldPlansHash:sha(JSON.stringify(plans)),site:'site',jiraProject:'TC',changes:remaining,reopenRoots:[],reopenRows:[],reopenSkipped:[],planHash:'verified'};
 const env={requireBAWorkspace:()=>{},baPreparationRun:null,baAttentionRun:null,jiraSyncBusy:false,activeProject:{id:'p'},baPreparationSessions:sessions,registry:{},
 brWorkflow:{load:async()=>register,plan:()=>remaining,approvePreparedJira:async()=>{calls.push('approve');return register;}},
 jiraPreviewFieldPlans:plans,sha,recordBAProcess:async()=>{},requireBAOwner:async()=>{},requireBAWritableCycle:async()=>{},effectiveConfig:()=>config,getAtlassianToken:async()=> 'token',validProjectKey:x=>x,
 jiraReadIssue:async()=>({id:'1',fields:{project:{key:'TC'},issuetype:{name:'Epic'},labels:['marker']}}),jiraScopedMarker:()=> 'marker',jiraMarker:()=> 'marker',
 postBAPreparation:async(id,state)=>{calls.push(state.phase);const next={...sessions.get(id),...state};sessions.set(id,next);return next;},
 notice:async()=>{},prepareBRJiraPreview:async()=>{calls.push('refresh');return refreshed;},baseAtlassian:()=> 'site',verifiedBAActor:async()=> 'BA',
 uiWarning:async(_title,_options,action)=>{calls.push('confirmation');return confirm?action:undefined;},baJiraRepublish:{preview:async()=>({blocked:[],rows:[],skipped:[]})},reopenServices:()=>({}),
 approvedJiraPreviewRevision:null,approvedJiraPreviewBinding:null,syncApprovedBRs:async()=>{calls.push('publish');assert.deepEqual(remaining.map(x=>x.path),['BR-015/F-001/S-002']);remaining=[];},brPreparationTitle:()=>''};
 const publish=new Function(...Object.keys(env),code+'\nreturn publishPreparedBRs;')(...Object.values(env));
 return {calls,sessions,publish:()=>publish({projectId:'p',revision:'r',registerRevision:'r'})};
}
test('partial publication refreshes expired preview and confirms remaining items in the same action',async()=>{
 const h=harness();await h.publish();assert.ok(h.calls.indexOf('refresh')<h.calls.indexOf('confirmation'));
 assert.ok(h.calls.indexOf('confirmation')<h.calls.indexOf('publish'));assert.equal(h.sessions.get('p').phase,'published');
});
test('cancelling refreshed publication does not approve or write to Jira',async()=>{
 const h=harness({confirm:false});await h.publish();assert.ok(h.calls.includes('confirmation'));assert.ok(!h.calls.includes('approve'));assert.ok(!h.calls.includes('publish'));assert.equal(h.sessions.get('p').phase,'ready');
});
test('refreshed blocking conflicts prevent publication',async()=>{
 const h=harness({blocked:true});await h.publish();assert.ok(!h.calls.includes('confirmation'));assert.ok(!h.calls.includes('publish'));assert.equal(h.sessions.get('p').phase,'draft');
});
