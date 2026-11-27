'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const memory=require('../src/workspace-memory');
const {ProjectMemory}=require('../service/ai/memory');
async function fixture(fn){
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-shared-memory-'));
 const projectId='sample-work',project=path.join(workspace,'projects',projectId);
 try{
  await fs.mkdir(path.join(workspace,'.atgv'),{recursive:true});
  await fs.writeFile(path.join(workspace,'.atgv','atgv.workspace.json'),JSON.stringify({schema:1,managedBy:'aia-my.atgv-aiatech-assist'}));
  await fs.mkdir(project,{recursive:true});
  await fs.writeFile(path.join(project,'atgv.project.json'),JSON.stringify({schema:4,id:projectId,name:'Test'}));
  await fn({workspace,project,projectId,memdir:path.join(workspace,'.atgv','memory')});
 }finally{await fs.rm(workspace,{recursive:true,force:true});}
}
test('managed projects store AI SQLite in shared private memory, not the project knowledge directory',()=>fixture(async({workspace,project,projectId,memdir})=>{
 const state=new ProjectMemory(project);
 try{state.set('project-test',{id:projectId});assert.deepEqual(state.get('project-test'),{id:projectId});
  assert.equal(state.file,path.join(memdir,'ai-memory-'+projectId+'.sqlite'));}
 finally{state.close();}
 const d=new DatabaseSync(path.join(memdir,'ai-memory.sqlite'));
 try{assert.equal(d.prepare('SELECT sqlite_file FROM project_memory_index WHERE project_id=?').get(projectId).sqlite_file,'ai-memory-'+projectId+'.sqlite');}
 finally{d.close();}
 await assert.rejects(fs.stat(path.join(project,'knowledge','ai-memory.sqlite')),{code:'ENOENT'});
 await fs.stat(path.join(memdir,'.gitignore'));
 await fs.stat(memory.extensionMemoryPath(workspace));
}));
test('existing project memory is migrated using SQLite snapshot and preserved for rollback',()=>fixture(async({project,projectId,memdir})=>{
 const folder=path.join(project,'knowledge');await fs.mkdir(folder,{recursive:true});
 const old=path.join(folder,'ai-memory.sqlite');const db=new DatabaseSync(old);
 db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated TEXT NOT NULL)');
 db.prepare('INSERT INTO kv VALUES(?,?,?)').run('prior',JSON.stringify({approved:7}),new Date().toISOString());db.close();
 const current=new ProjectMemory(project);
 try{assert.deepEqual(current.get('prior'),{approved:7});assert.equal(current.file,path.join(memdir,'ai-memory-'+projectId+'.sqlite'));}
 finally{current.close();}
 const backups=await fs.readdir(path.join(memdir,'legacy-backups'));
 assert.equal(backups.length,1);assert.match(backups[0],/\.sqlite\.bak$/);
 await assert.rejects(fs.stat(old),{code:'ENOENT'});
}));
test('vault writes AES-256-GCM ciphertext and shares credentials across extension and project callers',()=>fixture(async({workspace,memdir})=>{
 const values=new Map(),secrets={get:async k=>values.get(k),store:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k)};
 const vault=memory.secretStorageBridge({secrets,workspaceRoot:()=>workspace});
 const credential='ghp_test_secret_DO_NOT_LOG_582342',key='atgvAssist.extension.githubToken';
 await vault.store(key,credential);
 assert.equal(await vault.get(key),credential);
 assert.equal(await memory.secretStorageBridge({secrets,workspaceRoot:()=>workspace}).get(key),credential);
 assert.equal([...values.values()].includes(credential),false,'raw secret must never remain in SecretStorage');
 const bytes=await fs.readFile(path.join(memdir,'credentials.sqlite'));
 assert.equal(bytes.includes(Buffer.from(credential)),false,'SQLite file must contain ciphertext only');
 const db=new DatabaseSync(path.join(memdir,'credentials.sqlite'));
 try{const row=db.prepare('SELECT id,nonce,ciphertext,tag FROM credentials').get();
 assert.equal(typeof row.id,'string');assert.equal(row.nonce.length,12);assert.equal(row.tag.length,16);
 assert.notEqual(Buffer.from(row.ciphertext).toString('utf8'),credential);}
 finally{db.close();}
 await vault.delete(key);assert.equal(await vault.get(key),undefined);
}));
test('only same-folder staged credentials migrate on first read; unbound legacy credentials are ignored',()=>fixture(async({workspace,memdir})=>{
 const key='atgvAssist.project.test.githubToken',token='legacy-useful-secret-302190',values=new Map([[key,'unbound-legacy'],[memory.pendingSecretName(workspace,key),token]]);
 const secrets={get:async k=>values.get(k),store:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k)};
 const vault=memory.secretStorageBridge({secrets,workspaceRoot:()=>workspace});
 assert.equal(await vault.get(key),token);
 assert.equal(values.get(key),'unbound-legacy','unbound legacy credential is not read or removed');
 assert.equal(values.has(memory.pendingSecretName(workspace,key)),false,'scoped staged credential removed after successful encryption');
 assert.equal(await vault.get(key),token);
 await fs.stat(path.join(memdir,'credentials.sqlite'));
}));
test('SQLite snapshot preserves database records and never overwrites an existing destination',()=>fixture(async({workspace,memdir})=>{
 const source=memory.extensionMemoryPath(workspace),dest=path.join(memdir,'test-copy.sqlite');
 const db=new DatabaseSync(source);db.prepare('INSERT INTO agent_memory VALUES(?,?,?)').run('opt-in',JSON.stringify({enabled:true}),'now');db.close();
 assert.equal(memory.sqliteSnapshot(source,dest),true);
 assert.equal(memory.sqliteSnapshot(source,dest),false);
 const cloned=new DatabaseSync(dest);try{assert.deepEqual(JSON.parse(cloned.prepare('SELECT value FROM agent_memory WHERE key=?').get('opt-in').value),{enabled:true});}finally{cloned.close();}
}));

test('two folders on the same computer isolate pending and encrypted credentials and defaults',()=>fixture(async({workspace:a})=>fixture(async({workspace:b})=>{
 const values=new Map([['atgvAssist.extension.atlassianToken','legacy-global']]),settings=new Map([['atgvAssist.extensionSettings',{jira:{email:'legacy@example.com'}}],['atgvAssist.startupSetup.completed',true]]);
 const secrets={get:async k=>values.get(k),store:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k)};
 const state={get:k=>settings.get(k),update:async(k,v)=>settings.set(k,v)};
 const key='atgvAssist.extension.atlassianToken';
 const A=memory.secretStorageBridge({secrets,workspaceRoot:()=>a}),B=memory.secretStorageBridge({secrets,workspaceRoot:()=>b});
 const sa=memory.workspaceSettingsBridge({state,workspaceRoot:()=>a}),sb=memory.workspaceSettingsBridge({state,workspaceRoot:()=>b});
 assert.equal(await A.get(key),undefined);assert.equal(await B.get(key),undefined);
 assert.deepEqual(sa.get('atgvAssist.extensionSettings',{}),{});assert.equal(sb.get('atgvAssist.startupSetup.completed',false),false);
 await sa.update('atgvAssist.extensionSettings',{jira:{email:'a@example.com'}});await sa.update('atgvAssist.startupSetup.completed',true);
 await sb.update('atgvAssist.extensionSettings',{jira:{email:'b@example.com'}});
 assert.equal(sa.get('atgvAssist.extensionSettings').jira.email,'a@example.com');assert.equal(sb.get('atgvAssist.extensionSettings').jira.email,'b@example.com');
 assert.equal(sb.get('atgvAssist.startupSetup.completed',false),false);
 await Promise.all([A.store(key,'token-a'),B.store(key,'token-b')]);
 assert.equal(await A.get(key),'token-a');assert.equal(await B.get(key),'token-b');
 await A.delete(key);assert.equal(await A.get(key),undefined);assert.equal(await B.get(key),'token-b');assert.equal(values.get(key),'legacy-global');
 const fresh=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-fresh-folder-'));
 try{
  const C=memory.secretStorageBridge({secrets,workspaceRoot:()=>fresh});
  assert.equal(await C.get(key),undefined);await C.store(key,'token-c');assert.equal(await C.get(key),'token-c');assert.equal(await B.get(key),'token-b');
  await fs.mkdir(path.join(fresh,'.atgv'));await fs.writeFile(path.join(fresh,'.atgv','atgv.workspace.json'),JSON.stringify({managedBy:'aia-my.atgv-aiatech-assist'}));
  assert.equal(await C.get(key),'token-c');assert.equal(values.has(memory.pendingSecretName(fresh,key)),false);
 }finally{await fs.rm(fresh,{recursive:true,force:true});}
})));
