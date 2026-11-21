'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeRows,ConfluenceUserDatabase}=require('../src/confluence-user-database');
const presence=require('../src/my-work-presence');
const root=path.join(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
const config={get:key=>({
 'jira.baseUrl':'https://example.atlassian.net',
 'jira.email':'verified@example.com',
 'confluence.baseUrl':'https://example.atlassian.net/wiki',
 'confluence.spaceKey':'TCC1'
}[key]||'')};
test('duplicate Jira identities and legacy email-in-name display collapse safely',()=>{
 const email='person@example.com';
 const raw=presence.renderRows([
  {id:'acct-1',name:'Person',email,roles:['Developer'],tasks:'TC-1 (To Do)'},
  {id:'acct-1',name:'Person '+email,email,roles:['Project Manager'],tasks:'TC-2 (In Progress)'}
 ]);
 const rows=presence.extractRows(raw);
 assert.equal(rows.length,1);
 assert.equal(rows[0].email,email);
 assert.deepEqual(rows[0].roles,['Developer','Project Manager']);
 assert.equal(rows[0].tasks,'TC-2 (In Progress)');
 assert.ok(!rows[0].name.includes(email));
});
test('different account IDs with the same email never silently merge',()=>{
 const data=normalizeRows([{id:'id-1',email:'x@example.com',name:'X',roles:[]},{id:'id-2',email:'x@example.com',name:'X2',roles:[]}]);
 assert.equal(data.conflicts.length,1);
 assert.equal(data.rows.length,1);
});
test('Confluence database v2 CRUD is versioned, project-scoped and idempotent',async()=>{
 let db=null,property=null;
 const request=async(url,options)=>{
  const method=options.method||'GET';
  if(url.includes('/rest/api/content/search'))return {results:db?[{id:'91',title:db.title,type:'database'}]:[]};
  if(url.endsWith('/api/v2/databases')&&method==='POST'){db={id:'91',spaceId:'55',title:options.data.title,status:'current'};return db;}
  if(url.endsWith('/api/v2/databases/91')&&method==='GET')return db;
  if(url.includes('/databases/91/properties?'))return {results:property?[property]:[]};
  if(url.endsWith('/databases/91/properties')&&method==='POST'){
   property={id:'50',key:options.data.key,value:options.data.value,version:{number:1}};return property;
  }
  if(url.endsWith('/databases/91/properties/50')&&method==='PUT'){
   assert.equal(options.data.version.number,property.version.number+1);
   property={...property,value:options.data.value,version:{number:property.version.number+1}};
   return property;
  }
  throw Error('Unexpected route '+method+' '+url);
 };
 const adapter=new ConfluenceUserDatabase(config,'token','TC',{request,spaceProvider:async()=>({id:'55',key:'TCC1'})});
 const first=await adapter.upsert([{id:'acct-1',email:'person@example.com',name:'Person',roles:['Developer'],tasks:'No assigned task'}]);
 assert.equal(first.changed,true);assert.equal(first.databaseId,'91');
 const duplicate=await adapter.upsert([{id:'acct-1',email:'person@example.com',name:'Person',roles:['Developer'],tasks:'No assigned task'}]);
 assert.equal(duplicate.changed,false);
 const changed=await adapter.upsert([{id:'acct-1',email:'person@example.com',name:'Person',roles:['Project Manager'],tasks:'TC-758 (In Progress)'}]);
 assert.equal(changed.rows.length,1);
 assert.deepEqual(changed.rows[0].roles,['Developer','Project Manager']);
 assert.equal(changed.rows[0].tasks,'TC-758 (In Progress)');
 assert.equal(property.version.number,2);
});
test('runtime, DataTables, Confluence recovery, and Reset backup verification are wired',()=>{
 const ui=source('media/start.js'),host=source('src/lib/runtime/extension-runtime.js'),
 html=source('src/lib/webview/dashboard-html.js'),recovery=source('src/confluence-br-recovery.js');
 assert.match(html,/id="overviewUserAddForm"/);
 assert.match(ui,/ATGVDataTables\.mount\(root,entries/);
 assert.match(ui,/recoverJiraOnlyBR/);
 assert.match(host,/case 'myWorkRosterAddUser':/);
 assert.match(host,/case 'recoverJiraOnlyBR':/);
 assert.match(host,/ATGV Reset blocked:/);
 assert.match(recovery,/cannot reconstruct the original BR/);
 assert.doesNotMatch(recovery,/jiraDeleteIssue|deleteJira|DELETE.*\/rest\/api/);
});
