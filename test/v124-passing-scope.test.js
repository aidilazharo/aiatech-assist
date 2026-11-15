'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {plan,assertSelection}=require('../src/design-impact-plan');
const {writeConfluence}=require('../src/clients');
const makeRegister=()=>({brs:[{id:'BR-VERIFIED',approvedRevision:3,status:'approved',needsRefresh:false}]});
const latest=refs=>({designs:{api:[{id:'api-1',status:'approved',number:2,sourceBusinessRequirements:refs}]}});
test('known approved direct BR revision change is eligible but still needs approval',()=>{
 const result=plan(makeRegister(),latest([{id:'BR-VERIFIED',revision:2}]));
 assert.deepEqual(result.candidates.map(x=>x.kind),['api']);
 assert.equal(result.candidates[0].requiresReview,true);
 assert.equal(result.requiresApproval,true);
 assert.deepEqual(assertSelection(result,['api']),['api']);
});
test('missing approved BR cannot be used to infer a regeneration candidate',()=>{
 const result=plan(makeRegister(),latest([{id:'BR-DELETED',revision:1}]));
 assert.equal(result.candidates.length,0);
 assert.match(result.skipped.find(x=>x.kind==='api').reason,/Unverified approved requirement provenance/);
 assert.throws(()=>assertSelection(result,['api']),/selection changed/);
});
test('mixed verified stale and unknown BR link must block batch regeneration pending review',()=>{
 const result=plan(makeRegister(),latest([{id:'BR-VERIFIED',revision:2},{id:'BR-MISSING',revision:1}]));
 assert.equal(result.candidates.length,0);
 assert.deepEqual(result.skipped.find(x=>x.kind==='api').brIds,['BR-MISSING']);
});
test('unapproved BR and invalid provenance revisions do not trigger generation',()=>{
 const register={brs:[{id:'BR-VERIFIED',status:'draft',approvedRevision:9}]};
 for(const refs of [[{id:'BR-VERIFIED',revision:8}],[{id:'BR-VERIFIED',revision:0}],[null], [{id:'BR-VERIFIED',revision:'unknown'}]]){
  const x=plan(register,latest(refs));assert.equal(x.candidates.length,0);
 }
});
test('manually edited draft is preserved even with confirmed BR changes',()=>{
 const s=latest([{id:'BR-VERIFIED',revision:2}]);s.designs.api[0].status='draft';s.designs.api[0].manuallyEdited=true;
 const x=plan(makeRegister(),s);
 assert.equal(x.candidates.length,0);assert.match(x.skipped.find(i=>i.kind==='api').reason,/Manually edited/);
});
test('Confluence Free page create refuses an invalid configured parent before network writes',async()=>{
 const config={get:k=>({'jira.baseUrl':'https://sample.atlassian.net','jira.email':'safe@example.invalid','confluence.baseUrl':'https://sample.atlassian.net/wiki','confluence.parentPageId':'TCC/home'})[k]||''};
 let requests=0;const old=global.fetch;global.fetch=async()=>{requests++;throw Error('Should never send');};
 try{await assert.rejects(writeConfluence(config,'dummy',{spaceId:'4882442',title:'Disposable',bodyHtml:'<p>Test</p>'}),/Invalid Confluence parent page ID/);assert.equal(requests,0);}
 finally{global.fetch=old;}
});
test('Confluence Free ordinary create with valid parent retains no private restrictions',async()=>{
 const config={get:k=>({'jira.baseUrl':'https://sample.atlassian.net','jira.email':'safe@example.invalid','confluence.baseUrl':'https://sample.atlassian.net/wiki','confluence.parentPageId':'4882619'})[k]||''};
 const old=global.fetch;let sent;
 global.fetch=async (_url,o)=>{sent=JSON.parse(o.body);return new Response(JSON.stringify({id:'999',version:{number:1}}),{status:200,headers:{'Content-Type':'application/json'}});};
 try{await writeConfluence(config,'dummy',{spaceId:'4882442',title:'Disposable',bodyHtml:'<p>Test</p>'});}
 finally{global.fetch=old;}
 assert.equal(sent.parentId,'4882619');assert.equal(sent.status,'current');assert.equal(JSON.stringify(sent).includes('private'),false);
});
test('secondary-action menus close on item clicks, and Escape restores summary focus',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(js,/const clickedItem=event\.type==='click'/);
 assert.match(js,/clickedItem\)\{/);
 assert.match(js,/event\.type==='keydown'&&details\.contains\(document\.activeElement\)/);
});
test('webview design impact candidates agree with host about unknown provenance',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
 assert.match(js,/!revisions\.has\(String\(ref\.id\|\|''\)\)/);
 assert.match(js,/Number\.isSafeInteger\(Number\(ref\.revision\)\)/);
 const pkg=require('../package.json');assert.equal(pkg.version,'0.3.53');
});
