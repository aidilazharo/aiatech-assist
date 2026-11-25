'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const manifest=require('../package.json');
async function until(fn){for(let i=0;i<1500;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Timeout waiting for host action');}
function makeProject(id,key){return {id,name:id,settings:{jira:{projectKey:key},confluence:{spaceKey:key}}};}

test('ATGV lifecycle commands and project dashboard save defaults and overrides',async()=>{
  assert.deepEqual(manifest.contributes.commands.map(c=>c.title),['ATGV: Start','ATGV: Workspace','ATGV: AI','ATGV: Refresh Shared Project Artifacts','ATGV: Restart','ATGV: Reset','ATGV: Report an Issue']);
  assert.equal(manifest.contributes.viewsContainers,undefined,'No Explorer sidebar or Activity Bar view is contributed');
  assert.equal(manifest.contributes.views,undefined);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-vscode-host-'));
  const commands=new Map(),secrets=new Map(),workspaceState=new Map(),globalState=new Map(),messages=[];
  const lastState=()=>messages.filter(m=>m.type==='state').at(-1);
  let handler,panel,answer='first-secret',confirmation='Continue to RESET';
  const uri=p=>({fsPath:p,toString:()=>`file://${p}`});
  const fake={
    TreeItem:class{constructor(label,c){this.label=label;this.collapsibleState=c;}},
    TreeItemCollapsibleState:{None:0,Expanded:2},EventEmitter:class{event=()=>({dispose(){}});fire(){}},ThemeIcon:class{constructor(id){this.id=id;}},
    Uri:{joinPath(u,...parts){return uri(path.join(u.fsPath,...parts));},file:uri,parse:uri},ViewColumn:{One:1},ProgressLocation:{Notification:1},
    workspace:{workspaceFolders:[{uri:uri(root)}],getConfiguration(){return {get:(key,fallback)=>fallback};},onDidChangeWorkspaceFolders(){return {dispose(){}};}},
    commands:{registerCommand(name,fn){commands.set(name,fn);return {dispose(){}};},async executeCommand(){return true;}},
    window:{registerTreeDataProvider(){return {dispose(){}};},createOutputChannel(){return {appendLine(){},show(){},dispose(){}};},
      createWebviewPanel(viewType,title,viewColumn,options){panel={viewType,title,options,reveal(){},onDidDispose(){return {dispose(){}};},webview:{set html(value){this._html=value;queueMicrotask(()=>handler?.({command:'webviewReady',coreStylesLoaded:true}));},get html(){return this._html;},cspSource:'vscode-resource:',asWebviewUri:u=>u.fsPath,postMessage:async m=>{messages.push(m);if(m.type==='hostDialogRequest')queueMicrotask(()=>handler?.({command:'hostDialogResponse',requestId:m.requestId,accepted:confirmation!==undefined,value:m.dialogType==='input'?answer:confirmation}));return true;},onDidReceiveMessage:fn=>{handler=fn;return {dispose(){}};}}};return panel;},
      async showInputBox(){return answer;},async showWarningMessage(){return confirmation;},async showInformationMessage(){return null;},async showErrorMessage(e){throw Error(e);},
      async withProgress(_,fn){return fn();}},
    authentication:{async getSession(){return undefined;}}
  };
  const orig=Module._load,originalFetch=global.fetch;
  const resetGit=require('../src/developer-git'),resetCatalog=require('../src/github-sdlc-catalog');
  const originalClone=resetGit.cloneConfigured,originalCatalogSync=resetCatalog.syncGitWorkspace;
  const releaseUpdater=require('../src/lib/updates/github-release-updater'),libraryUpdater=require('../src/lib/updates/library-release-updater');
  const originalReleaseLookup=releaseUpdater.latestRelease,originalLibraryLookup=libraryUpdater.latest;
  releaseUpdater.latestRelease=async()=>null;libraryUpdater.latest=async()=>null;
  const stagedClones=[],stagedCatalogs=[];
  const apiRequests=[];
  global.fetch=async(url,options)=>{
    apiRequests.push({url,options});
    assert.match(options.headers.Authorization,url.includes('api.github.com')?/^Bearer /:/^Basic /);
    if(url.includes('/rest/api/3/project/FIN'))return {ok:true,status:200,json:async()=>({id:'10',key:'FIN',name:'Finance'})};
    if(url.includes('/wiki/api/v2/spaces/1005'))return {ok:true,status:200,json:async()=>({id:'1005',key:'FIN',name:'Finance Knowledge'})};
    if(url.includes('/rest/api/3/myself'))return {ok:true,status:200,json:async()=>({accountId:'some-id',displayName:'ATGV Test User'})};
    if(url==='https://api.github.com/user')return {ok:true,status:200,json:async()=>({login:'test-user'})};
    if(url.endsWith('/branches/main'))return {ok:true,status:200,json:async()=>({name:'main'})};
    if(url.includes('/branches?'))return {ok:true,status:200,json:async()=>[]};
    if(url.includes('/repos/aia-org/shared-docs'))return {ok:true,status:200,json:async()=>({full_name:'aia-org/shared-docs',private:true,default_branch:'main'})};
    if(url.includes('/user/repos?'))return {ok:true,status:200,json:async()=>[
      {full_name:'aia-org/shared-docs',private:true,default_branch:'main'},
      {full_name:'other/not-selected',private:false,default_branch:'main'}]};
    if(url.includes('/wiki/api/v2/spaces'))return {ok:true,status:200,json:async()=>({results:[{id:'1005',key:'FIN',name:'Finance Knowledge'}],_links:{}})};
    if(url.includes('/rest/api/3/project/search'))return {ok:true,status:200,json:async()=>({values:[{key:'FIN',name:'Finance',id:'10'}]})};
    throw new Error('Unexpected discovery API '+url);
  };
  let ext;
  try{
    Module._load=function(name,parent,main){return name==='vscode'?fake:orig.call(this,name,parent,main);};
    delete require.cache[require.resolve('../src/extension')];
    ext=require('../src/extension');Module._load=orig;
    const ctx={extensionUri:uri(path.resolve(__dirname,'..')),globalStorageUri:uri(path.join(root,'private')),
      globalState:{get:k=>globalState.get(k),update:async(k,v)=>{if(v===undefined)globalState.delete(k);else globalState.set(k,v);}},
      workspaceState:{get:k=>workspaceState.get(k),update:async(k,v)=>{if(v===undefined)workspaceState.delete(k);else workspaceState.set(k,v);}},
      secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v),delete:async k=>secrets.delete(k)},subscriptions:[]};
    ext.activate(ctx);
    assert.deepEqual([...commands.keys()].sort(),['atgvAssist.ai','atgvAssist.refreshUnifiedArtifacts','atgvAssist.reportIssue','atgvAssist.reset','atgvAssist.restart','atgvAssist.start','atgvAssist.workspace']);
    await commands.get('atgvAssist.start')({skipReload:true});
    assert.match(panel.webview.html,/Extension Settings/);
    assert.match(panel.webview.html,/Search Confluence spaces/);
    assert.match(panel.webview.html,/id="jiraBaseUrl"/);
    assert.match(panel.webview.html,/id="jiraToken"/);
    assert.match(panel.webview.html,/id="githubPersonalToken"/);
    assert.match(panel.webview.html,/Project Settings/);
    assert.match(panel.webview.html,/Test JIRA Connection/);
    assert.match(panel.webview.html,/Test GitHub Connection/);
    assert.match(panel.webview.html,/GitHub Library/);
    assert.match(panel.webview.html,/id="catalogRepoUrl"/);
    assert.match(panel.webview.html,/id=\"saveGithub\"[^>]+disabled/);
    assert.match(panel.webview.html,/default-src 'none'/);
                                                                        
    handler({command:'saveExtension',settings:{jira:{baseUrl:'https://aia.atlassian.net',email:'somebody@aia.com'}}});
    await until(()=>messages.some(m=>m.type==='notice'&&m.error&&/Test Jira Connection/.test(m.message)));
    assert.equal(globalState.has('atgvAssist.extensionSettings'),false);
    handler({command:'testExtensionJira',requestId:1,settings:{jira:{baseUrl:'https://aia.atlassian.net',email:'somebody@aia.com'}},token:'first-secret'});
    await until(()=>messages.some(m=>m.type==='connectionTestResult'&&m.section==='jira'&&m.success));
    assert.equal(globalState.has('atgvAssist.extensionSettings'),false);
    assert.equal(secrets.size,0);
                                                           
    handler({command:'saveExtension',settings:{jira:{baseUrl:'https://aia.atlassian.net',email:'different@aia.com'}}});
    await until(()=>messages.some(m=>m.type==='notice'&&m.error&&/current settings/.test(m.message)));
    assert.equal(globalState.has('atgvAssist.extensionSettings'),false);
    handler({command:'saveExtension',settings:{jira:{baseUrl:'https://aia.atlassian.net',email:'somebody@aia.com'}}});
    await until(()=>globalState.has('atgvAssist.extensionSettings'));
    await until(()=>secrets.size===1);
    assert.equal(JSON.parse([...secrets.values()][0]).token,'first-secret');
    assert.equal(globalState.get('atgvAssist.extensionSettings').jira.baseUrl,'https://aia.atlassian.net');
    assert.equal(messages.filter(m=>m.type==='discovered').length,0,'Saving Jira must not auto-fetch spaces');
    assert.equal(apiRequests.length,1,'Only connection-test request is sent before user searches');
    handler({command:'discover',query:'',origin:'settings'});
    await until(()=>messages.some(m=>m.type==='notice'&&m.error&&/2 characters/.test(m.message)));
    assert.equal(apiRequests.length,1,'Blank search must not call Confluence');
    handler({command:'discover',query:'FIN',origin:'settings'});
    await until(()=>messages.some(m=>m.type==='discovered'));
    const discovered=messages.find(m=>m.type==='discovered');
    assert.equal(discovered.origin,'settings');
    assert.deepEqual(discovered.spaces,[{id:'1005',key:'FIN',name:'Finance Knowledge',baseUrl:'https://aia.atlassian.net/wiki'}]);
    assert.equal(discovered.projects[0].key,'FIN');
    assert.equal(apiRequests.length,3);
                                                                                   
    handler({command:'testExtensionGithub',requestId:2,settings:{owner:'aia-org',repo:'https://github.com/aia-org/shared-docs'},token:'github-personal'});
    await until(()=>messages.some(m=>m.type==='connectionTestResult'&&m.section==='github'&&m.success));
    assert.equal(globalState.get('atgvAssist.extensionSettings').github?.repo,undefined);
    handler({command:'saveGithub',settings:{owner:'aia-org',repo:'shared-docs'}});
    await until(()=>globalState.get('atgvAssist.extensionSettings')?.github?.repo==='shared-docs');
    await until(()=>secrets.has('atgvAssist.extension.githubToken')&&secrets.has('atgvAssist.sdlcCatalogToken'));
    assert.equal(JSON.parse(secrets.get('atgvAssist.extension.githubToken')).token,'github-personal');
    assert.equal(secrets.get('atgvAssist.sdlcCatalogToken'),'github-personal');
    handler({command:'listExtensionGithubRepositories',requestId:31,owner:'aia-org'});
    await until(()=>messages.some(m=>m.type==='githubRepositoriesResult'&&m.requestId===31));
    const repos=messages.find(m=>m.type==='githubRepositoriesResult'&&m.requestId===31);
    assert.equal(repos.success,true);
    assert.deepEqual(repos.repositories.map(r=>r.fullName),['aia-org/shared-docs']);
    assert.equal(repos.repositories[0].private,true);
    assert.equal(globalState.get('atgvAssist.extensionSettings').github.repo,'shared-docs','Listing repositories must never modify saved settings');
    handler({command:'listExtensionGithubRepositories',requestId:32,owner:'bad/name'});
    await until(()=>messages.some(m=>m.type==='githubRepositoriesResult'&&m.requestId===32));
    assert.equal(messages.find(m=>m.type==='githubRepositoriesResult'&&m.requestId===32).success,false);
                                                                                     
    handler({command:'openingInitialize'});
    await until(()=>messages.some(m=>m.type==='notice'&&m.error&&/Required step: tested/.test(m.message)));
    assert.equal(await fs.readdir(root).then(a=>a.includes('.atgv')),false);
    handler({command:'openingSelect',spaceId:'1005'});
    await until(()=>messages.some(m=>m.type==='state'&&m.opening?.phase==='selected'));
    assert.equal(await fs.readdir(root).then(a=>a.includes('projects')),false,'Selection must not create folders');
    handler({command:'openingOpen'});
    await until(()=>messages.some(m=>m.type==='notice'&&m.error&&/Required step: initialized/.test(m.message)));
    handler({command:'openingTest'});
    await until(()=>messages.some(m=>m.type==='state'&&m.opening?.phase==='tested'));
    assert.equal(await fs.readdir(root).then(a=>a.includes('projects')),false,'Testing must not create files');
    handler({command:'openingInitialize'});
    await until(()=>messages.some(m=>m.type==='state'&&m.opening?.phase==='initialized'));
    assert.equal(await fs.stat(path.join(root,'.atgv','library','templates','tech-stacks','react.json')).then(()=>true,()=>false),false);
    assert.ok((await fs.stat(path.join(root,'projects','finance-knowledge','sdlc','roles'))).isDirectory());
     assert.equal(await fs.stat(path.join(root,'projects','finance-knowledge','sdlc','roles','business-analyst.yaml')).then(()=>true,()=>false),false,'shared SDLC role definitions are not copied into each project');
    handler({command:'openingOpen'});
    await until(()=>messages.some(m=>m.type==='state'&&m.opening?.phase==='open'));
    await until(()=>messages.some(m=>m.type==='notice'&&/SDLC navigation is now available/.test(m.message)));
    assert.equal(workspaceState.get('atgvAssist.activeProject'),'finance-knowledge');
    assert.deepEqual(workspaceState.get('atgvAssist.recentProjects'),['finance-knowledge']);
                                                                                        
    globalState.set('atgvAssist.startupSetup.completed',true); // Existing verified users skip first-run setup.
    await commands.get('atgvAssist.start')({skipReload:true});
    handler({command:'openingAuto',projectId:'finance-knowledge'});
    await until(()=>messages.some(m=>m.type==='openingProgress'&&m.stage==='done'));
    await until(()=>lastState()?.opening?.phase==='open');
    assert.equal(workspaceState.get('atgvAssist.activeProject'),'finance-knowledge');
    assert.deepEqual(workspaceState.get('atgvAssist.recentProjects'),['finance-knowledge']);
    assert.ok(messages.some(m=>m.type==='openingProgress'&&m.stage==='connection'));
    assert.ok(messages.some(m=>m.type==='openingProgress'&&m.stage==='files'));
                                                                              
    const beforeRestart=messages.length;
    await commands.get('atgvAssist.start')({skipReload:true});
    assert.match(panel.webview.html, /<html lang="en">/);
    await until(()=>messages.slice(beforeRestart).some(m=>m.type==='state'&&m.opening?.phase==='search'));
    assert.equal(lastState()?.opening?.phase,'search','Restart must show project selection when setup is incomplete');
    assert.equal(lastState()?.activeId,null,'Incomplete setup must not re-open a project automatically');
    assert.ok(messages.some(m=>m.type==='startupScan'&&/Choose a project/.test(m.message)));
    handler({command:'openingBack'});
    await until(()=>lastState()?.opening?.phase==='search');
    handler({command:'create',project:makeProject('claims','CLM')});
    await until(()=>messages.some(m=>m.type==='created'&&m.id==='claims'));
    const saved=JSON.parse(await fs.readFile(path.join(root,'projects','claims','atgv.project.json'),'utf8'));
    assert.equal(saved.schema,4);
    assert.equal(saved.settings.jira.projectKey,'CLM');
    assert.equal(await fs.stat(path.join(root,'.atgv','library','templates','tech-stacks','react.json')).then(()=>true,()=>false),false,'No hardcoded local stack templates');
    await assert.rejects(()=>fs.access(path.join(root,'projects','claims','sdlc','roles','business-analyst.yaml')),{code:'ENOENT'});
    assert.match(panel.webview.html,/id="techStackGrid"/);
    assert.equal(saved.settings.jira.baseUrl,undefined);
    await until(()=>lastState()?.opening?.phase==='selected');
    assert.equal(lastState()?.opening?.phase,'selected','Manual creation selects but must not open the project');
                                                                           
                                                              
    const savedFetch=global.fetch;global.fetch=async()=>{throw new Error('Simulated network outage');};
    handler({command:'openingAuto',projectId:'claims'});
    await until(()=>lastState()?.opening?.phase==='open'&&lastState()?.openingOffline===true);
    assert.equal(messages.some(m=>m.type==='openingError'&&m.canOffline&&/Simulated network outage/.test(m.message)),false,
      'Connectivity failures must not demand another click to enter local ATGV');
    assert.equal(workspaceState.get('atgvAssist.activeProject'),'claims');
    assert.ok(await fs.stat(path.join(root,'projects','claims','documents','requirements')));
                                                                        
                                                                        
                                                                             
    handler({command:'setCoordinationProvider',provider:'local'});
    await until(()=>globalState.get('atgvAssist.coordinationProvider')==='local');
    handler({command:'getDocumentOwnership',roleId:'business-analyst',taskId:'requirements'});
    await until(()=>messages.some(m=>m.type==='documentOwnership'&&m.documentId==='business-analyst--requirements'));
    const firstOwner=messages.filter(m=>m.type==='documentOwnership').at(-1);
    assert.equal(firstOwner.owner.ownerId,null);
    assert.equal(firstOwner.scope,'local');
    handler({command:'documentOwnershipAction',roleId:'business-analyst',taskId:'requirements',action:'claim',revision:0});
    await until(()=>messages.some(m=>m.type==='documentOwnership'&&m.owner?.ownerId==='first-secret'));
    const claim=messages.filter(m=>m.type==='documentOwnership').at(-1);
    assert.equal(claim.owner.ownerId,'first-secret');assert.equal(claim.owner.isMe,true);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'projects','claims','sdlc','local-ownership.json'),'utf8')).documents['claims/business-analyst--requirements'].ownerId,'first-secret');
    handler({command:'catalogSave',config:{repositoryUrl:'https://github.com/aia/catalog',ref:'main',authentication:'public',autoCheck:false}});
    await until(()=>globalState.has('atgvAssist.sdlcCatalog'));
    assert.equal(globalState.get('atgvAssist.sdlcCatalog').repositoryUrl,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills');
    await until(()=>messages.some(m=>m.type==='catalogState'&&m.catalog?.config?.repositoryUrl==='https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills'));
    handler({command:'createJiraTicket',summary:'Must not create'});
    await until(()=>messages.some(m=>m.type==='notice'&&m.error&&/Jira writes require approved BRs/.test(m.message)));
    global.fetch=savedFetch;
    await commands.get('atgvAssist.start')({skipReload:true});
    handler({command:'create',project:makeProject('finance','FIN')});
    await until(()=>messages.some(m=>m.type==='created'&&m.id==='finance'));
    // The created acknowledgement is the synchronous completion signal.
    // The webview requests its own asynchronous refresh, which can be delayed
    // when the entire extension test suite is running concurrently in CI.
    // The persisted registry is asserted directly below instead.
    assert.equal((await fs.readdir(path.join(root,'projects'))).length,3);
    // Jira Project Key is a verified global default, never a silent project remapping.
    handler({command:'testExtensionJira',requestId:19,settings:{jira:{baseUrl:'https://aia.atlassian.net',email:'somebody@aia.com',projectKey:'fin'}}});
    await until(()=>messages.some(m=>m.type==='connectionTestResult'&&m.section==='jira'&&m.requestId===19&&m.success));
    assert.ok(apiRequests.some(req=>req.url.endsWith('/rest/api/3/project/FIN')),'Jira project key should be verified by read-only lookup');
    handler({command:'saveExtension',settings:{jira:{baseUrl:'https://aia.atlassian.net',email:'somebody@aia.com',projectKey:'NOT_FIN'}}});
    await until(()=>messages.some(m=>m.type==='notice'&&m.error&&/current settings/.test(m.message)));
    assert.equal(globalState.get('atgvAssist.extensionSettings').jira.projectKey,undefined,'Unverified Jira key must not be saved');
    const settingsSavedBefore=messages.filter(m=>m.type==='settingsSaved'&&m.section==='jira').length;
    handler({command:'saveExtension',settings:{jira:{baseUrl:'https://aia.atlassian.net',email:'somebody@aia.com',projectKey:'fin'}}});
    await until(()=>globalState.get('atgvAssist.extensionSettings')?.jira?.projectKey==='FIN');
    await until(()=>messages.filter(m=>m.type==='settingsSaved'&&m.section==='jira').length>settingsSavedBefore);
    const oldProject=JSON.parse(await fs.readFile(path.join(root,'projects','claims','atgv.project.json'),'utf8'));
    assert.equal(oldProject.settings.jira.projectKey,'CLM','Changing default Jira project must not remap existing projects');
                                                            
    confirmation=undefined;await commands.get('atgvAssist.reset')();
    assert.equal((await fs.readdir(path.join(root,'projects'))).length,3);
                                                                               
    confirmation='Continue to RESET';answer='RESET ALL LOCAL ATGV 3 PROJECTS';
    // Stage fresh remote checkout without accessing network in a VS Code host
    // test. Real reset calls developerGit.cloneConfigured and catalog Git sync.
    resetGit.cloneConfigured=async(parent,owner,name,branch)=>{
      const target=path.join(parent,name);await fs.mkdir(target,{recursive:true});
      await fs.writeFile(path.join(target,'fresh-from-origin.txt'),'fresh remote checkout');
      stagedClones.push({parent,owner,name,branch});return {root:target,branch};
    };
    resetCatalog.syncGitWorkspace=async(config,token,workspace)=>{
      stagedCatalogs.push({config,token,workspace});return {sha:'a'.repeat(40)};
    };
    await fs.writeFile(path.join(root,'projects','claims','local-only.txt'),'destroy me');
    await fs.writeFile(path.join(root,'keep.txt'),'outside projects');
    await fs.mkdir(path.join(root,'private','projects'),{recursive:true});
    await commands.get('atgvAssist.reset')();
    assert.deepEqual((await fs.readdir(path.join(root,'projects'))).sort(),['claims','finance','finance-knowledge']);
    await assert.rejects(()=>fs.access(path.join(root,'projects','claims','local-only.txt')),{code:'ENOENT'});
    assert.equal(await fs.readFile(path.join(root,'projects','claims','repository','shared-docs','fresh-from-origin.txt'),'utf8'),'fresh remote checkout');
    assert.equal((await fs.readdir(root)).filter(name=>name.startsWith('.atgv-reset-staging-')).length,0);
    assert.ok(await fs.stat(path.join(root,'.atgv','atgv.workspace.json')));
    assert.equal(stagedClones.length,3);
    assert.equal(stagedCatalogs.length,1);
    assert.equal(await fs.readFile(path.join(root,'keep.txt'),'utf8'),'outside projects');
    // Credentials now share an encrypted workspace SQLite vault. Local Reset
    // must preserve BOTH decrypted values, not raw SecretStorage entries.
    const restoredVault=require('../src/workspace-memory').secretStorageBridge({
      secrets:ctx.secrets,workspaceRoot:()=>root
    });
    assert.equal(JSON.parse(await restoredVault.get('atgvAssist.extension.atlassianToken')).token,'first-secret');
    assert.equal(JSON.parse(await restoredVault.get('atgvAssist.extension.githubToken')).token,'github-personal');
    assert.equal([...secrets.values()].some(value=>String(value).includes('first-secret')||String(value).includes('github-personal')),false,
      'No unencrypted credential remains in SecretStorage once migrated');
    assert.ok(await fs.stat(path.join(root,'.atgv','memory','credentials.sqlite')));
    assert.equal(globalState.get('atgvAssist.extensionSettings').github.repo,'shared-docs');
    assert.equal(globalState.get('atgvAssist.extensionSettings').jira.projectKey,'FIN');
    assert.equal(globalState.get('atgvAssist.sdlcCatalog').repositoryUrl,'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills');
    assert.equal(globalState.get('atgvAssist.coordinationProvider'),'local');
    assert.deepEqual((await fs.readFile(path.join(root,'projects','claims','atgv.project.json'),'utf8').then(JSON.parse)).settings.jira.projectKey,'CLM');
    assert.equal(workspaceState.has('atgvAssist.activeProject'),false);
  }finally{try{await ext?.deactivate();}finally{Module._load=orig;global.fetch=originalFetch;resetGit.cloneConfigured=originalClone;resetCatalog.syncGitWorkspace=originalCatalogSync;releaseUpdater.latestRelease=originalReleaseLookup;libraryUpdater.latest=originalLibraryLookup;await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}}
});
