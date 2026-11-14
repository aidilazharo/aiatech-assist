'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {normalizeExtensionSettings}=require('../src/projects');
const read=file=>require('node:fs').readFileSync(path.join(__dirname,'..',file),'utf8');
async function until(fn){for(let i=0;i<350;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Timed out waiting for GitHub test or save');}

test('GitHub can store a verified account PAT without choosing a repository, and it survives a new test',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v283-github-'));
 const uri=p=>({fsPath:p,toString:()=>`file://${p}`});
 const commands=new Map(),globalState=new Map(),secrets=new Map(),messages=[];
 let handler;
 const fake={
  TreeItem:class{},TreeItemCollapsibleState:{None:0,Expanded:2},EventEmitter:class{event=()=>({dispose(){}});fire(){}},ThemeIcon:class{},
  Uri:{joinPath(u,...parts){return uri(path.join(u.fsPath,...parts));},file:uri,parse:uri},ViewColumn:{One:1},ProgressLocation:{Notification:1},
  workspace:{workspaceFolders:[{uri:uri(folder)}],getConfiguration(){return{get:(_,fallback)=>fallback};},onDidChangeWorkspaceFolders(){return{dispose(){}};}},
  commands:{registerCommand(n,f){commands.set(n,f);return{dispose(){}};},async executeCommand(){return true;}},
  window:{createOutputChannel(){return{appendLine(){},show(){},dispose(){}};},
   createWebviewPanel(){return{reveal(){},onDidDispose(){return{dispose(){}};},webview:{cspSource:'vscode-resource:',asWebviewUri:u=>u.fsPath,postMessage:async m=>{messages.push(m);return true;},onDidReceiveMessage:f=>{handler=f;return{dispose(){}};}}};},
   async showWarningMessage(){return null;},async showInformationMessage(){return null;},async showErrorMessage(){return null;},async withProgress(_,f){return f();}},
  authentication:{async getSession(){return undefined;}}
 };
 const previousLoad=Module._load,previousFetch=global.fetch;
 let userLookups=0;
 global.fetch=async(url,opts)=>{
  if(String(url)==='https://api.github.com/user'){
   userLookups++;
   if(opts.headers.Authorization==='Bearer bad')return{ok:false,status:401,text:async()=>'{"message":"Bad credentials"}'};
   assert.equal(opts.headers.Authorization,'Bearer ghp-account');
   return{ok:true,status:200,json:async()=>({login:'catalog-owner',id:55})};
  }
  throw Error('Unexpected network request: '+url);
 };
 try{
  Module._load=function(name,parent,main){return name==='vscode'?fake:previousLoad.call(this,name,parent,main);};
  delete require.cache[require.resolve('../src/extension')];
  const ext=require('../src/extension');Module._load=previousLoad;
  const ctx={extensionUri:uri(path.resolve(__dirname,'..')),globalStorageUri:uri(path.join(folder,'private')),
   globalState:{get:k=>globalState.get(k),update:async(k,v)=>globalState.set(k,v)},
   workspaceState:{get(){},async update(){}},
   secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v),delete:async k=>secrets.delete(k)},subscriptions:[]};
  ext.activate(ctx);await commands.get('atgvAssist.start')({skipReload:true});
  assert.equal(typeof handler,'function');
  handler({command:'testExtensionGithub',requestId:60,settings:{owner:'',repo:'',branch:''},token:'ghp-account'});
  await until(()=>messages.some(m=>m.type==='connectionTestResult'&&m.requestId===60));
  const first=messages.find(m=>m.type==='connectionTestResult'&&m.requestId===60);
  assert.equal(first.success,true);assert.equal(first.repoConfigured,false);
  assert.match(first.message,/account verified/);
  handler({command:'saveGithub',settings:{owner:'',repo:'',branch:''}});
  await until(()=>messages.some(m=>m.type==='settingsSaved'&&m.section==='github'));
  assert.ok([...secrets.values()].some(v=>JSON.parse(v).token==='ghp-account'));
  assert.ok(globalState.has('atgvAssist.extensionSettings'));
  const saved=messages.find(m=>m.type==='settingsSaved'&&m.section==='github');
  assert.match(saved.message,/credentials saved/);
  assert.ok(!messages.some(m=>m.type==='notice'&&/GitHub account.*saved/.test(m.message)),'saving does not duplicate the inline status');
  handler({command:'testExtensionGithub',requestId:61,settings:{owner:'',repo:'',branch:''},token:''});
  await until(()=>messages.some(m=>m.type==='connectionTestResult'&&m.requestId===61));
  assert.equal(messages.find(m=>m.type==='connectionTestResult'&&m.requestId===61).success,true);
  handler({command:'testExtensionGithub',requestId:62,settings:{owner:'',repo:'',branch:''},token:'bad'});
  await until(()=>messages.some(m=>m.type==='connectionTestResult'&&m.requestId===62));
  assert.equal(messages.find(m=>m.type==='connectionTestResult'&&m.requestId===62).success,false);
  assert.ok(!messages.some(m=>m.type==='notice'&&m.error&&/GitHub|HTTP 401/.test(m.message)), 'GitHub test failure stays in GitHub test-status only');
  assert.equal(userLookups,3);
 }finally{Module._load=previousLoad;global.fetch=previousFetch;await fs.rm(folder,{recursive:true,force:true});}
});

test('GitHub owner may be saved without repository, but a repository cannot lack owner',()=>{
 const host=read('test/generated/extension-source.txt'),ui=read('media/start.js');
 assert.match(host,/if\(fields\.repo&&!fields\.owner\)/);
 assert.match(host,/if\(fields\.branch&&!fields\.repo\)/);
 assert.match(host,/case 'saveGithub':/);
 assert.match(host,/case 'testExtensionGithub':/);
 assert.match(ui,/if\(m\.type==='settingsSaveResult'&&m\.section==='github'\)/);
 assert.match(ui,/if\(m\.section==='github'\)\{\s*\$\('githubTestStatus'\)\.textContent/);
 assert.equal(normalizeExtensionSettings({github:{owner:'someowner',repo:''}}).github.owner,'someowner');
});
