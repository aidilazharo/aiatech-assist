'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {verifyRegistered}=require('../src/my-work-presence');
const read=p=>fs.readFileSync(require.resolve('../'+p),'utf8');
test('registration requires the exact verified account and updated profile',()=>{
 const rows=[{id:'acct-2',name:'Updated User',email:'new@example.com',roles:[]}];
 assert.equal(verifyRegistered(rows,'acct-2',{name:'Updated User',email:'new@example.com'}),rows[0]);
 assert.throws(()=>verifyRegistered(rows,'acct-1'),/could not be confirmed/);
 assert.throws(()=>verifyRegistered(rows,'acct-2',{name:'Old User'}),/could not be confirmed/);
});
test('registration, refresh and role visits use one queue and exact project binding',()=>{
 const host=read('src/lib/runtime/extension-runtime.js'),ui=read('media/start.js'),presence=read('src/my-work-presence.js');
 assert.match(host,/function enqueueRosterOperation/);
 assert.match(host,/await enqueueRosterOperation/);
 assert.match(host,/if\(activeProject\?\.id===projectId\)await dashboard\?\.webview\.postMessage/);
 assert.match(ui,/rosterAddProject===activeId&&m\.requestId!==rosterAddRequest/);
 assert.match(presence,/getConfluencePage\(config,token,savedId\)/);
 assert.match(presence,/normalizeRows\(\[\.\.\.pageRows,\.\.\.\(db\?\.rows\|\|\[\]\)\]\)/);
});
