'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const transfer=require('../src/ba-br-transfer');
const inventory=require('../src/jira-project-inventory');
const root=path.resolve(__dirname,'..');
const read=path=>fs.readFileSync(require('node:path').join(root,path),'utf8');
const br='BR-003',key='TC-813',project='TC',original='account-creator',before='account-ba-old',after='account-ba-new';
function issue(owner=before,updated='2026-11-22T20:00:00Z'){
 return {key,fields:{project:{key:project},issuetype:{name:'Epic'},summary:br+': Accessible Approved User Experience',
  updated,reporter:owner?{accountId:owner,displayName:'Reporter '+owner}:null,
  creator:{accountId:original,displayName:'Original Creator'}}};
}
test('BA roster contains only real Business Analysts and excludes the existing owner',()=>{
 const users=transfer.candidates([
  {id:before,name:'Old BA',roles:['Business Analyst']},
  {id:after,name:'New BA',roles:['Business Analyst','Project Manager']},
  {id:'account-dev',name:'Developer',roles:['Developer']},
  {id:after,name:'Duplicate',roles:['Business Analyst']},
  {id:'',name:'No Jira identity',roles:['Business Analyst']}],before);
 assert.deepEqual(users,[{accountId:after,name:'New BA'}]);
});
test('permission, Jira identity and BR root mapping fail closed',()=>{
 assert.equal(transfer.canModifyReporter({permissions:{BROWSE_PROJECTS:{havePermission:true},MODIFY_REPORTER:{havePermission:true}}}),true);
 assert.equal(transfer.canModifyReporter({permissions:{BROWSE_PROJECTS:{havePermission:true}}}),false);
 assert.equal(transfer.assertIssue(issue(),project,key,br,{}).ownerId,before);
 assert.throws(()=>transfer.assertActor(transfer.assertIssue(issue(),project,key,br,{}),'stranger'),/Only the current/);
 assert.throws(()=>transfer.assertIssue(issue(),project,key,br,{synced:{[br]:{key:'TC-500'}}}),/does not match/);
 assert.throws(()=>transfer.assertIssue({...issue(),fields:{...issue().fields,summary:'BR-099: Another BR'}},project,key,br,{}),/identifier/);
});
test('transfer modifies only the Epic Reporter and verifies updated Jira before success',async()=>{
 let state=issue(),writes=[],progress=[];
 const result=await transfer.transfer({projectKey:project,epicKey:key,brId:br,actorId:before,targetId:after,
  expectedUpdated:state.fields.updated,expectedOwnerId:before,
  readIssue:async()=>structuredClone(state),
  writeReporter:async(k,id)=>{writes.push([k,id]);state=issue(id,'2026-11-22T20:10:00Z');},
  onProgress:(phase,value)=>progress.push([phase,value])});
 assert.deepEqual(writes,[[key,after]]);
 assert.equal(result.ownerId,after);
 assert.equal(result.creatorId,original);
 assert.equal(state.fields.creator.accountId,original);
 assert.ok(progress.some(p=>p[1]===85));
});
test('stale ownership blocks transfer before any Jira writes',async()=>{
 let changes=0;
 await assert.rejects(transfer.transfer({projectKey:project,epicKey:key,brId:br,actorId:before,targetId:after,
  expectedUpdated:'old version',expectedOwnerId:before,readIssue:async()=>issue(),
  writeReporter:async()=>{changes++}}),/changed/);
 assert.equal(changes,0);
});
test('failure to read back the selected owner initiates compensation',async()=>{
 let owner=before,writes=[],reads=0;
 await assert.rejects(transfer.transfer({projectKey:project,epicKey:key,brId:br,actorId:before,targetId:after,
  expectedUpdated:issue().fields.updated,expectedOwnerId:before,
  readIssue:async()=>{reads++;return issue(reads===3?before:owner);},
  writeReporter:async(k,id)=>{writes.push([k,id]);owner=id;}}),/could not be verified/);
 assert.deepEqual(writes,[[key,after],[key,before]]);
});
test('inventory retains immutable creator and separately shows mutable reporter',()=>{
 const normalized=inventory.normalizeIssue({...issue(after),fields:{...issue(after).fields,creator:{accountId:original,displayName:'First Creator'},
  reporter:{accountId:after,displayName:'New BA'}}},project);
 assert.equal(normalized.creator,'First Creator');
 assert.equal(normalized.reporter,'New BA');
 assert.equal(normalized.reporterId,after);
});
test('BR modal, host and role-aware transfer progress are wired',()=>{
 const markup=read('src/lib/webview/dashboard-html.js');
 const ui=read('media/start.js'),host=read('src/lib/runtime/extension-runtime.js');
 assert.match(markup,/id="baTransferOpen"/);
 assert.match(markup,/id="baTransferPanel"/);
 assert.match(markup,/id="baTransferUsers"/);
 assert.match(markup,/id="baTransferProgress"/);
 assert.match(markup,/id="baTransferStatus"/);
 assert.doesNotMatch(markup,/id="baRestartIncomplete"|id="baOverviewNew"/);
 assert.match(ui,/function setBATransferProgress/);
 assert.match(ui,/send\('baJiraTransferCandidates'/);
 assert.match(ui,/send\('baJiraTransferOwner'/);
 assert.match(ui,/m\.type==='baJiraTransferCompleted'/);
 assert.match(ui,/setBATransferProgress\(100,'Transfer completed'\)/);
 assert.match(ui,/searchJiraInventory\(\)/);
 assert.match(ui,/label:'BR owner'/);
 assert.match(ui,/label:'Created by'/);
 assert.match(ui,/ba-jira-only-delete','🗑'/);
 assert.match(host,/case 'baJiraTransferCandidates':/);
 assert.match(host,/case 'baJiraTransferOwner':/);
 assert.match(host,/MODIFY_REPORTER/);
 assert.match(host,/myWorkPresence\.readRoster\(config,token,projectKey\)/);
 assert.match(host,/const rows=found\.rows/);
 assert.match(host,/baBRTransfer\.candidates\(rows,root\.ownerId\)/);
 assert.match(host,/baBRTransfer\.transfer/);
 assert.match(host,/baJiraTransferCompleted/);
 assert.match(host,/reporter:accountId\?\{accountId\}:null/);
});
