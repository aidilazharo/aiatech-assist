'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const credentials=require('../src/repo-sync-credentials');
const sync=require('../src/repo-sync-pr'),workspace=require('../src/repo-sync-workspace');
const source=String.raw`github_pat_`+'a'.repeat(45),other='ghp_'+'b'.repeat(40);
test('credential-bearing URLs parse correctly and strip their secrets from canonical URLs',()=>{
 const item=credentials.parseCredentialUrl('https://person:'+source+'@github.com/Acme/repo-a');
 assert.equal(item.name,'Acme/repo-a');assert.equal(item.token,source);
 assert.equal(item.webUrl,'https://github.com/Acme/repo-a');
 assert.equal(item.url,'https://github.com/Acme/repo-a.git');
 assert.equal(credentials.parseCredentialUrl('https://github.com/Acme/repo-b.git').token,'');
 assert.equal(credentials.parseCredentialUrl('https://person:'+other+'@github.com/Acme/repo-b.git').webUrl,'https://github.com/Acme/repo-b');
});
test('credential URL rejects invalid hosts, queries, missing fields and malformed PATs',()=>{
 for(const input of [
  'https://evil.example/Acme/repo','http://person:'+source+'@github.com/Acme/repo',
  'https://github.com.evil.test/Acme/repo','https://person:'+source+'@github.com/Acme/repo?leak=1',
  'https://person@github.com/Acme/repo','https://:bad@github.com/Acme/repo',
  'https://person:short@github.com/Acme/repo','https://person:'+source+'@github.com/Acme/repo/extra'
 ])assert.throws(()=>credentials.parseCredentialUrl(input),input.split('@').pop());
});
test('connection tests validate permissions and exact repository identity without mutation',async()=>{
 const repo=credentials.parseCredentialUrl('https://person:'+source+'@github.com/Acme/repo-a');
 const request=async(_repo,_token,suffix)=>({status:200,body:suffix==='/user'?{login:'tester'}:suffix?[]:{full_name:'Acme/repo-a',private:true,permissions:{pull:true,push:false}}});
 assert.equal((await credentials.verifyConnection(repo,source,'Source',request)).permission,'pull');
 await assert.rejects(credentials.verifyConnection(repo,source,'Destination',request),/write access/);
 await assert.rejects(credentials.verifyConnection(repo,source,'Source',async()=>({status:401})),/authentication failed/);
 await assert.rejects(credentials.verifyConnection(repo,source,'Source',async()=>({status:200,body:{full_name:'Other/repo'}})),/different repository/);
});
test('UI has independent test buttons and masks/strips PAT URLs',()=>{
 const html=workspace.workspaceHtml({nonce:'safe',version:'0.3.79',cspSource:'vscode-resource:'});
 for(const snippet of ['id="testSource"','id="testDestination"','id="sourceConnection"','id="destinationConnection"','username:PAT','consumeUrl('])assert.ok(html.includes(snippet),snippet);
 assert.equal((html.match(/>Test Connection</g)||[]).length,6);
 assert.equal((html.match(/type="password"/g)||[]).length,6);
 for(const prefix of ['','library-','project-']){
  for(const id of ['testSource','testDestination','sourceConnection','destinationConnection']){
   assert.equal(html.split('id="'+prefix+id+'"').length-1,1,prefix+id);
  }
  for(const id of ['sourceUrl','destinationRepo']){
   const input=html.match(new RegExp('<input[^>]*id="'+prefix+id+'"[^>]*>'))?.[0];
   assert.ok(input,prefix+id);
   assert.match(input,/type="password"/);
  }
 }
 assert.match(html,/type="password"/);
 const script=html.match(/<script nonce="safe">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);assert.doesNotThrow(()=>new Function(script));
});
test('source PAT is stored only after successful connection test',async()=>{
 let handler,dispose;const messages=[],memory=new Map();
 const fake={ViewColumn:{One:1},Uri:{parse:v=>v},env:{openExternal:async()=>{}},window:{
  createWebviewPanel:()=>({reveal:()=>{},onDidDispose:fn=>{dispose=fn;},webview:{cspSource:'vscode-resource:',html:'',onDidReceiveMessage:fn=>{handler=fn;},postMessage:async d=>messages.push(d)}}),
  showInputBox:async()=>other,showOpenDialog:async()=>[],showWarningMessage:async()=> 'Create Sync PR'
 }};
 workspace.open(fake,{version:'0.3.79',secrets:{get:async k=>memory.get(k),store:async(k,v)=>memory.set(k,v)},
  testConnection:async(repo,pat,kind)=>{assert.equal(kind,'Source');assert.equal(repo.name,'Acme/repo-a');assert.equal(pat,source);return {repo:repo.name,permission:'pull'};}});
 try{
  await handler({command:'testRepoConnection',kind:'Source',url:'https://person:'+source+'@github.com/Acme/repo-a'});
  assert.ok(messages.some(x=>x.type==='repoConnectionResult'&&x.success===true&&x.safeUrl==='https://github.com/Acme/repo-a'));
  assert.equal([...memory.values()][0],source);
 }finally{dispose?.();}
});
test('AI branch plan rejects unsafe branch names and accepts a scoped descriptive branch',()=>{
 const src={owner:'Acme',repo:'repo-a',name:'Acme/repo-a'};
 assert.equal(sync.aiSyncPlan({branch:'feat/add-tdd-1234abcd',commitMessage:'feat: improve tests',prTitle:'Add tests',prDescription:'Review scope.'},src,'feat: add TDD coverage','1234abcd'.repeat(5)).branch,'feat/add-tdd');
 for(const bad of ['main','release', 'sync/repo-b/not-owned','sync/repo-a/../../oops','sync/repo-a/not valid','sync/repo-a/a;exit','sync/repo-a/a\nnext'])
  assert.equal(sync.aiSyncPlan({branch:bad},src).branch,'',bad);
});
