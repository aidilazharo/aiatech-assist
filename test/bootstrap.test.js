'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {initializeWorkspaceFolders,installationSignature,lifecycleAction}=require('../src/bootstrap');
const {ProjectRegistry}=require('../src/projects');
const catalogFixture=require('./catalog-fixture');

const temp=()=>fs.mkdtemp(path.join(os.tmpdir(),'atgv-bootstrap-'));
const exists=async p=>fs.access(p).then(()=>true,()=>false);
const until=async fn=>{for(let i=0;i<250;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for startup');};

test('ATGV: Start initializes an empty workspace but does not invent a project',async()=>{
  const root=await temp();
  try{
    const registry=new ProjectRegistry(root);
    assert.deepEqual(await initializeWorkspaceFolders(root,registry),{initialized:true,projects:0});
    assert.equal(await exists(path.join(root,'.atgv','templates','tech-stacks','nestjs.json')),false,'stack templates are remote-only');
    assert.equal(await exists(path.join(root,'.atgv','skills','business-analyst','SKILL.md')),false,'role skills are remote-only');
    assert.deepEqual(await fs.readdir(path.join(root,'projects')),[]);
    const custom=path.join(root,'.atgv','templates','business-requirement.md');
    await fs.writeFile(custom,'Enterprise custom template');
    await initializeWorkspaceFolders(root,registry);
    assert.equal(await fs.readFile(custom,'utf8'),'Enterprise custom template');
    assert.deepEqual(await fs.readdir(path.join(root,'projects')),[]);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('ATGV: Start repairs missing existing project folders without replacing documents',async()=>{
  const root=await temp();
  try{
    const reg=new ProjectRegistry(root);
    const project=await reg.create({name:'Customer Portal',techStackId:'react'});
    const documents=path.join(root,'projects',project.id,'documents','requirements');
    await fs.mkdir(documents,{recursive:true});
    await fs.writeFile(path.join(documents,'business.md'),'Edited customer acceptance criteria');
    assert.deepEqual(await initializeWorkspaceFolders(root,reg),{initialized:true,projects:1});
    assert.equal(await fs.readFile(path.join(documents,'business.md'),'utf8'),'Edited customer acceptance criteria');
    assert.ok(await exists(path.join(root,'projects',project.id,'sdlc','processes')));
    assert.equal(await exists(path.join(root,'projects',project.id,'documents','architecture','tech-stack.md')),true,'existing placeholder is preserved before catalog activation');
    await catalogFixture.activate(root);await initializeWorkspaceFolders(root,reg);
    assert.ok(await exists(path.join(root,'projects',project.id,'documents','architecture','tech-stack.md')));
    await fs.rm(path.join(root,'projects',project.id,'sdlc'),{recursive:true});
    await initializeWorkspaceFolders(root,reg);
    assert.ok(await exists(path.join(root,'projects',project.id,'sdlc','roles','business-analyst.yaml')));
    assert.equal(await fs.readFile(path.join(documents,'business.md'),'utf8'),'Edited customer acceptance criteria');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('ATGV: Start will not scaffold through a symlinked projects directory',async()=>{
  const root=await temp(),outside=await temp();
  try{
    await fs.symlink(outside,path.join(root,'projects'));
    await assert.rejects(()=>initializeWorkspaceFolders(root,new ProjectRegistry(root)),/real directory/);
    assert.deepEqual(await fs.readdir(outside),[]);
  }finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});}
});

test('installation identity distinguishes version changes and same-version reinstall',async()=>{
  const root=await temp();
  try{
    await fs.writeFile(path.join(root,'package.json'),'{}');
    const old=await installationSignature(root,'0.0.6');
    assert.equal(lifecycleAction(old,'',false),'offer-reload');
    assert.equal(lifecycleAction(old,old,false),'none');
    assert.equal(lifecycleAction(old,old,true),'start');
    assert.notEqual(await installationSignature(root,'0.0.7'),old);
    await fs.rm(path.join(root,'package.json'));
    await fs.writeFile(path.join(root,'package.json'),'{}');
    assert.notEqual(await installationSignature(root,'0.0.6'),old);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('install notification reloads on approval then opens ATGV: Start after reload',async()=>{
  const root=await temp();
  const state=new Map(), workspaceState=new Map(), registered=new Map(), calls=[];
  let panel,decision='Reload Window & Start';
  const uri=p=>({fsPath:p,toString:()=>`file://${p}`});
  const fake={
    TreeItem:class{constructor(label,collapsible){this.label=label;this.collapsibleState=collapsible;}},
    TreeItemCollapsibleState:{None:0,Expanded:2},EventEmitter:class{event=()=>({dispose(){}});fire(){}},ThemeIcon:class{},
    Uri:{joinPath(u,...parts){return uri(path.join(u.fsPath,...parts));},file:uri,parse:uri},ViewColumn:{One:1},ProgressLocation:{Notification:1},
    workspace:{workspaceFolders:[{uri:uri(root)}],getConfiguration(){return {get:(key,fallback)=>fallback};},onDidChangeWorkspaceFolders(){return {dispose(){}};}},
    commands:{registerCommand(n,fn){registered.set(n,fn);return {dispose(){}};},async executeCommand(n,...args){calls.push(n);if(registered.has(n))return registered.get(n)(...args);return true;}},
    window:{registerTreeDataProvider(){return {dispose(){}};},createOutputChannel(){return {appendLine(){},dispose(){}};},
      createWebviewPanel(type,title,column,options){panel={type,title,options,reveal(){},onDidDispose(){},webview:{cspSource:'x',asWebviewUri:u=>u.fsPath,postMessage:async()=>true,onDidReceiveMessage(){}}};return panel;},
      async showInformationMessage(){return decision;},async showErrorMessage(e){throw Error(e);},async showWarningMessage(){},async withProgress(_,fn){return fn();}},
    authentication:{async getSession(){}}
  };
  const original=Module._load;
  try{
    Module._load=function(name,parent,main){return name==='vscode'?fake:original.call(this,name,parent,main);};
    delete require.cache[require.resolve('../src/extension')];
    const extension=require('../src/extension');
    const ctx={extensionUri:uri(path.join(__dirname,'..')),globalStorageUri:uri(path.join(root,'private')),
      globalState:{get:(k,f)=>state.has(k)?state.get(k):f,update:async(k,v)=>{if(v===undefined)state.delete(k);else state.set(k,v);}},
      workspaceState:{get:k=>workspaceState.get(k),update:async(k,v)=>workspaceState.set(k,v)},
      secrets:{get:async()=>undefined,store:async()=>{},delete:async()=>{}},subscriptions:[]};
    extension.activate(ctx);
    await until(()=>calls.includes('workbench.action.reloadWindow'));
    assert.equal(state.get('atgvAssist.pendingStartAfterReload'),true);
    assert.equal(panel,undefined,'do not open ATGV until reload');
    decision=undefined;
    extension.activate(ctx);                                                             
    await until(()=>Boolean(panel));
    assert.equal(panel.title,'ATGV: Start');
    assert.equal(state.has('atgvAssist.pendingStartAfterReload'),false);
    assert.equal(await exists(path.join(root,'.atgv','templates','tech-stacks','react.json')),false,'Start must not initialize files before connection test');
    assert.equal(await exists(path.join(root,'projects')),false,'Start must not create the projects folder');
    assert.deepEqual([...registered.keys()].sort(),['atgvAssist.refreshUnifiedArtifacts','atgvAssist.reportIssue','atgvAssist.reset','atgvAssist.restart','atgvAssist.start','atgvAssist.workspace']);
  }finally{
    Module._load=original;
    await fs.rm(root,{recursive:true,force:true});
  }
});
