'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {normalizeRows}=require('../src/confluence-user-database');
const source=fs.readFileSync(require.resolve('../src/my-work-presence'),'utf8');
function fixture({email='person@example.test',failDatabase=false,existing=[]}={}){
 const state={page:null,db:existing.map(row=>({...row,roles:[...row.roles]})),writes:0,dbWrites:0};
 const config={get:key=>({'jira.email':email,'jira.baseUrl':'https://example.atlassian.net'}[key]||'')};
 const me={accountId:'account-123',displayName:'Verified Person',emailAddress:email,active:true};
 const clients={
  baseAtlassian:()=> 'https://example.atlassian.net',baseConfluence:()=> 'https://example.atlassian.net/wiki',
  getConfluenceSpace:async()=>({id:'55',key:'SPACE'}),
  getConfluencePage:async()=>state.page,
  requestJson:async url=>{
   if(url.includes('/myself'))return me;
   if(url.includes('/api/v2/pages?'))return {results:state.page?[state.page]:[]};
   if(url.includes('/search/jql'))return {issues:[],isLast:true};
   throw Error('Unexpected route '+url);
  },
  writeConfluence:async(_config,_token,{title,bodyHtml})=>{
   state.writes++;state.page={id:'77',title,status:'current',body:{storage:{value:bodyHtml}},version:{number:state.writes}};return state.page;
  }
 };
 class Database{
  async read(){return {db:state.db.length?{id:'88'}:null,rows:state.db};}
  async upsert(rows){state.dbWrites++;if(failDatabase)throw Error('HTTP 403');state.db=normalizeRows([...state.db,...rows]).rows;return {databaseId:'88',rows:state.db};}
 }
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,require:name=>{
  if(name==='./clients')return clients;
  if(name==='./remote-actions')return {validProjectKey:key=>key};
  if(name==='./utils')return {htmlToText:s=>String(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()};
  if(name==='./confluence-user-database')return {ConfluenceUserDatabase:Database,normalizeRows};
  if(name==='./my-work-role-prompts')return {ROLES:{'software-developer':{name:'Developer'},'ux-designer':{name:'UI/UX Designer'}}};
  throw Error('Unexpected require '+name);
 }});
 return {state,config,presence:module.exports,me};
}
test('first-time user requires confirmation; cancellation never writes Confluence',async()=>{
 const {state,config,presence}=fixture();
 await assert.rejects(presence.visit(config,'token',{projectKey:'TC'}),/Confirm your ATGV/);
 const cancelled=await presence.visit(config,'token',{projectKey:'TC',roleId:'software-developer',confirmRegistration:async identity=>{
  assert.equal(identity.name,'Verified Person');assert.equal(identity.email,'person@example.test');return false;
 }});
 assert.equal(cancelled.registrationCancelled,true);assert.equal(state.writes,0);assert.equal(state.dbWrites,0);
});
test('confirmed user is saved, subsequent visits merge roles without prompting',async()=>{
 const {state,config,presence}=fixture();
 const first=await presence.visit(config,'token',{projectKey:'TC',roleId:'software-developer',confirmRegistration:async()=>true});
 assert.equal(first.registrationConfirmed,true);assert.equal(first.syncComplete,true);assert.equal(first.rows[0].id,'account-123');
 const second=await presence.visit(config,'token',{projectKey:'TC',roleId:'ux-designer',confirmRegistration:async()=>{throw Error('Unexpected modal');}});
 assert.equal(second.rows.length,1);assert.ok(second.rows[0].roles.includes('Developer'));assert.ok(second.rows[0].roles.includes('UI/UX Designer'));
 assert.equal(state.db.length,1);
});
test('database failure reports partial synchronization, not full success',async()=>{
 const {state,config,presence}=fixture({failDatabase:true});
 const result=await presence.visit(config,'token',{projectKey:'TC',confirmRegistration:async()=>true});
 assert.equal(state.writes,1);assert.equal(result.syncComplete,false);assert.match(result.registryWarning,/Database v2 sync needs attention/);
});
test('existing database-only user is mirrored to page without a second confirmation',async()=>{
 const {state,config,presence}=fixture({existing:[{id:'account-123',name:'Verified Person',email:'person@example.test',roles:['Developer'],tasks:'No assigned task'}]});
 const result=await presence.visit(config,'token',{projectKey:'TC',confirmRegistration:async()=>{throw Error('Unexpected modal');}});
 assert.equal(result.rows.length,1);assert.equal(state.writes,1);assert.equal(result.syncComplete,true);
});
test('account ID can register even when email is not available',async()=>{
 const {config,presence}=fixture({email:''});
 const result=await presence.visit(config,'token',{projectKey:'TC',confirmRegistration:async identity=>{assert.equal(identity.email,'');return true;}});
 assert.equal(result.rows[0].id,'account-123');assert.equal(result.syncComplete,true);
});
