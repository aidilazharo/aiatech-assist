'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const workspace=require('../src/repo-sync-workspace');
const sync=require('../src/repo-sync-pr');
const tokenA='ghp_'+'a'.repeat(40),tokenB='ghp_'+'b'.repeat(40),tokenC='ghp_'+'c'.repeat(40);
const repoOne='https://github.com/Acme/repo-one',repoTwo='https://github.com/Acme/repo-two';
const patKey=(kind,repo)=>'atgvAssist.repoSync.'+kind+'.'+crypto.createHash('sha256').update(repo.toLowerCase()).digest('hex');

function fixture(){
 let handler=null,disposed=null,inputCount=0;
 const messages=[],state=new Map(),secrets=new Map(),checked=[];
 const fake={ViewColumn:{One:1},Uri:{parse:value=>value},env:{openExternal:async()=>{}},window:{
  createWebviewPanel:()=>({reveal(){},onDidDispose(fn){disposed=fn;},webview:{
   cspSource:'vscode-resource:',html:'',onDidReceiveMessage(fn){handler=fn;},
   async postMessage(message){messages.push(message);}
  }}),
  showInputBox:async()=>{inputCount++;throw Error('Unexpected PAT prompt');},
  showWarningMessage:async()=> 'Forget Connection',
  showOpenDialog:async()=>[]
 }};
 const preferences={get:(k,defaultValue)=>state.get(k)??defaultValue,
  update:async(k,value)=>state.set(k,value)};
 const secretStorage={get:async k=>secrets.get(k),store:async(k,value)=>secrets.set(k,value),
  delete:async k=>{secrets.delete(k);}};
 const expected=new Map([
  ['Source|Acme/repo-one',tokenA],['Source|Acme/repo-two',tokenB],
  ['Destination|Acme/repo-one',tokenC]
 ]);
 const options={version:'0.3.85',preferences,secrets:secretStorage,testConnection:async(repo,token,kind)=>{
  checked.push({repo:repo.name,kind});
  assert.equal(token,expected.get(kind+'|'+repo.name));
  return {repo:repo.name,permission:kind==='Source'?'pull':'push'};
 }};
 function open(){
  workspace.open(fake,options);
  return {
   send:message=>handler(message),
   dispose:()=>disposed?.()
  };
 }
 return {open,messages,state,secrets,checked,get inputCount(){return inputCount;}};
}
test('Source and Destination each maintain a dropdown list of verified credentials',async()=>{
 const x=fixture();const panel=x.open();
 try{
  await panel.send({command:'testRepoConnection',kind:'Source',url:'https://alice:'+tokenA+'@github.com/Acme/repo-one'});
  await panel.send({command:'testRepoConnection',kind:'Source',url:'https://alice:'+tokenB+'@github.com/Acme/repo-two'});
  await panel.send({command:'testRepoConnection',kind:'Destination',url:'https://alice:'+tokenC+'@github.com/Acme/repo-one'});
  assert.deepEqual(x.state.get('atgvAssist.repoSync.savedSourceUrls'),[repoTwo,repoOne]);
  assert.deepEqual(x.state.get('atgvAssist.repoSync.savedDestinationUrls'),[repoOne]);
  assert.equal(x.state.get('atgvAssist.repoSync.lastSourceUrl'),repoTwo);
  assert.equal(x.state.get('atgvAssist.repoSync.lastDestinationUrl'),repoOne);
  assert.equal(x.secrets.get(patKey('Source','Acme/repo-one')),tokenA);
  assert.equal(x.secrets.get(patKey('Destination','Acme/repo-one')),tokenC);
  assert.equal(x.inputCount,0);
  assert.ok(!JSON.stringify([...x.state.values()]).includes('ghp_'));
  assert.ok(!JSON.stringify(x.messages).includes('ghp_'));
  const lists=x.messages.filter(m=>m.type==='repoSyncSavedList');
  assert.equal(lists.at(-2).kind,'Source');
  assert.equal(lists.at(-2).entries.length,2);
  assert.equal(lists.at(-1).entries[0].credentialSaved,true);
 }finally{panel.dispose();}
});
test('reopen restores multiple saved repositories, reuses correct role PAT and forgets only selected role',async()=>{
 const x=fixture();let panel=x.open();
 try{
  for(const [kind,repo,pat] of [
   ['Source','repo-one',tokenA],['Source','repo-two',tokenB],['Destination','repo-one',tokenC]
  ])await panel.send({command:'testRepoConnection',kind,url:'https://alice:'+pat+'@github.com/Acme/'+repo});
 }finally{panel.dispose();}
 x.messages.length=0;
 panel=x.open();
 try{
  await panel.send({command:'getRepoSyncSaved'});
  const restored=x.messages.filter(m=>m.type==='repoSyncSavedList');
  assert.equal(restored.length,4); // two from panel opening, two from explicit request
  assert.equal(restored.at(-2).entries.length,2);
  assert.equal(restored.at(-1).entries.length,1);
  await panel.send({command:'testRepoConnection',kind:'Source',url:repoOne});
  await panel.send({command:'testRepoConnection',kind:'Destination',url:repoOne});
  assert.equal(x.inputCount,0);
  await panel.send({command:'forgetRepoConnection',kind:'Source',url:repoOne});
  assert.equal(x.secrets.has(patKey('Source','Acme/repo-one')),false);
  assert.equal(x.secrets.get(patKey('Destination','Acme/repo-one')),tokenC);
  assert.deepEqual(x.state.get('atgvAssist.repoSync.savedSourceUrls'),[repoTwo]);
  assert.deepEqual(x.state.get('atgvAssist.repoSync.savedDestinationUrls'),[repoOne]);
  assert.ok(x.messages.some(m=>m.type==='repoSyncForgot'&&m.kind==='Source'&&m.safeUrl===repoOne));
  assert.ok(!JSON.stringify(x.messages).includes('ghp_'));
 }finally{panel.dispose();}
});
test('saved dropdowns include Add another and Forget selected, never expose PATs in HTML',()=>{
 const html=workspace.workspaceHtml({nonce:'csp-safe',version:'0.3.85',cspSource:'vscode-resource:'});
 for(const id of ['sourceSavedRepos','destinationSavedRepos','forgetSource','forgetDestination'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.equal((html.match(/Add another repository/g)||[]).length>=2,true);
 assert.ok(html.includes("repoSyncSavedList"));
 assert.ok(html.includes("forgetRepoConnection"));
 const script=html.match(/<script nonce="csp-safe">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);assert.doesNotThrow(()=>new Function(script));
});
test('source commit drives descriptive branch, message and brief PR details',()=>{
 const sha='2a50944d72c8d2f426935084ae447759720bf542';
 const specific='ci: remove non-release workflow sync-to-aia-pr.yml';
 const repo='tech-stacks-skills',files=['catalog.json','VERSION'];
 assert.equal(sync.genericMessage('Sync tech-stacks-skills from main'),true);
 assert.equal(sync.meaningfulSubject(specific,files),specific);
 assert.match(sync.branchName(repo,sha,specific,files),/^sync\/tech-stacks-skills\/remove-non-release-workflow-.*-2a50944d$/);
 const details=sync.prDetails({source:{name:'Acme/'+repo},destination:{name:'Acme/other'},
  sha,scope:'.',base:'main',sourceBranch:'main',
  branch:sync.branchName(repo,sha,specific,files),sourceMessage:specific,
  changedFiles:files,count:files.length});
 assert.equal(details.title,'Remove non-release workflow sync-to-aia-pr.yml');
 assert.equal(details.commit,specific);
 assert.ok(details.body.includes('## Summary'));
 assert.ok(details.body.includes('Files changed: 2'));
 assert.equal(details.body.includes('Safety and review'),false);
 const fallback=sync.branchName(repo,sha,'Sync tech-stacks-skills from main',['catalog.json']);
 assert.equal(fallback,'sync/tech-stacks-skills/update-catalog-json-2a50944d');
 const ai=sync.aiSyncPlan({branch:'sync/tech-stacks-skills/main',
  commitMessage:'Sync tech-stacks-skills from main',
  prTitle:'Sync tech-stacks-skills from main'}, {repo});
 assert.equal(ai.branch,'');
 assert.equal(ai.commitMessage,'');
 assert.equal(ai.prTitle,'');
});
