'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const store=require('../src/workspace-connection-settings');
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-settings-sqlite-'));
 try{
  await fs.mkdir(path.join(root,'.atgv'));
  await fs.writeFile(path.join(root,'.atgv','atgv.workspace.json'),JSON.stringify({schema:1,managedBy:'aia-my.atgv-aiatech-assist'}));
  return await fn(root);
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const config={jira:{baseUrl:'https://aiamy-jira-azure.atlassian.net',email:'person@example.com',projectKey:'TC'},confluence:{baseUrl:'https://aiamy-jira-azure.atlassian.net/wiki'},github:{owner:'aiamalaysia',repo:'tech-cockpit',branch:'main'}};
const library={repositoryUrl:'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills',ref:'main',authentication:'token',autoCheck:true};
test('Start and Settings share validated, non-secret SQLite connection data',()=>fixture(async root=>{
 const k=store.KEYS,mirror=new Map(),state={update:async(key,value)=>mirror.set(key,value)};
 assert.equal((await store.save(root,{[k.extension]:config,[k.library]:library,[k.onboarding]:true},state)).sqlite,true);
 assert.equal(mirror.get(k.extension).jira.projectKey,'TC');
 const db=new DatabaseSync(path.join(root,'.atgv','memory','settings.sqlite'));
 try{
  assert.equal(db.prepare('SELECT count(*) AS n FROM connection_settings').get().n,3);
  const data=JSON.parse(db.prepare('SELECT value FROM connection_settings WHERE key=?').get(k.extension).value);
  assert.equal(data.jira.email,'person@example.com');assert.equal(data.github.repo,'tech-cockpit');
  assert.equal(data.github.token,undefined);
 }finally{db.close();}
 const values=store.hydrate(root,{});
 assert.equal(values.sqlite,true);assert.equal(values[k.library].ref,'main');assert.equal(values[k.onboarding],true);
}));
test('SQLite wins on restart and migrates prior globalState only once',()=>fixture(async root=>{
 const k=store.KEYS,legacy={[k.extension]:config,[k.library]:library,[k.onboarding]:false};
 const first=store.hydrate(root,legacy);assert.equal(first.sqlite,true);
 const changed={...config,jira:{...config.jira,projectKey:'NEW'}};
 assert.equal(store.hydrate(root,{...legacy,[k.extension]:changed,[k.onboarding]:true})[k.extension].jira.projectKey,'TC');
 await store.save(root,{[k.extension]:changed});
 assert.equal(store.hydrate(root,legacy)[k.extension].jira.projectKey,'NEW');
}));
test('uninitialized workspace uses compatibility state without creating .atgv',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-settings-uninitialized-'));
 try{const key=store.KEYS.extension,state=new Map();
  assert.equal((await store.save(root,{[key]:config},{update:async(k,v)=>state.set(k,v)})).sqlite,false);
  assert.equal(state.get(key).github.owner,'aiamalaysia');
  assert.equal(store.hydrate(root,{[key]:config}).sqlite,false);
  await assert.rejects(fs.stat(path.join(root,'.atgv')),{code:'ENOENT'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('rejects unknown keys and removes unrecognized sensitive fields',()=>fixture(async root=>{
 await assert.rejects(store.save(root,{'atgvAssist.token':'plaintext'}),/Unsupported/);
 await assert.rejects(store.save(root,{[store.KEYS.onboarding]:'true'}),/boolean/);
 const extra={...config,jira:{...config.jira,password:'do-not-save'},github:{...config.github,token:'never-save-me'}};
 await store.save(root,{[store.KEYS.extension]:extra});
 const bytes=await fs.readFile(path.join(root,'.atgv','memory','settings.sqlite'));
 assert.equal(bytes.includes(Buffer.from('never-save-me')),false);
 assert.equal(bytes.includes(Buffer.from('do-not-save')),false);
 assert.throws(()=>store.canonical(store.KEYS.library,{repositoryUrl:'https://github.com/a/b',authentication:'root'}),/authentication/);
}));
test('invalid multi-key save cannot partially mutate SQLite',()=>fixture(async root=>{
 await store.save(root,{[store.KEYS.extension]:config});
 await assert.rejects(store.save(root,{[store.KEYS.extension]:{...config,jira:{...config.jira,projectKey:'NEW'}},[store.KEYS.onboarding]:'bad'}),/boolean/);
 assert.equal(store.hydrate(root,{})[store.KEYS.extension].jira.projectKey,'TC');
}));
test('Start, Settings and Library share persistence while duplicated controls are hidden',async()=>{
 const base=path.join(__dirname,'..');
 const [host,html]=await Promise.all(['src/lib/runtime/extension-runtime.js','src/lib/webview/dashboard-html.js'].map(p=>fs.readFile(path.join(base,p),'utf8')));
 assert.match(host,/sharedConnectionSettings\.hydrate\(ws\.uri\.fsPath,legacy\)/);
 assert.match(host,/persistConnectionSettings\(\{extension:settings,library:libraryConf\}\)/);
 assert.match(host,/persistConnectionSettings\(\{extension:next,setupComplete:false\}\)/);
 assert.match(html,/id="startupConnectionForm"/);assert.match(html,/id="settingsJiraGroup"/);assert.match(html,/id="settingsGithubGroup"/);
 assert.match(html,/id="pullLibraryFiles"[^>]*hidden/);assert.match(html,/id="knowledgeApiKey"[^>]*hidden/);
});
