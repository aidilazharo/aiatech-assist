'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const initial=require('../src/architect-initial-commit');
const identity={owner:'acme',name:'app'};
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-initial-'));try{git(root,'init','-b','main');git(root,'config','user.name','ATGV Test');git(root,'config','user.email','atgv@example.invalid');git(root,'remote','add','origin','https://github.com/acme/app.git');await fs.writeFile(path.join(root,'package.json'),'{"name":"app"}');await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('initial commit stages only reviewed source and preserves excluded sensitive files',()=>fixture(async root=>{
 await fs.writeFile(path.join(root,'.env'),'SECRET=example');
 await fs.writeFile(path.join(root,'config.json'),'{"password":"example-secret"}');
 await fs.mkdir(path.join(root,'node_modules'));await fs.writeFile(path.join(root,'node_modules','index.js'),'module.exports=1');
 await fs.writeFile(path.join(root,'main.js'),'console.log("hello")');
 const p=await initial.plan(root,identity);
 assert.deepEqual(p.files.map(x=>x.path),['main.js','package.json']);
 assert.match(initial.reviewText(p),/\.env/);
 assert.equal(git(root,'ls-files'),'');
 const result=await initial.commit(root,p,identity);
 assert.match(result.sha,/^[a-f0-9]{40}$/);
 assert.deepEqual(git(root,'ls-files').split('\n'),['main.js','package.json']);
 assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),'SECRET=example');
 await assert.rejects(initial.plan(root,identity),/history already exists/);
}));
test('source changes after review block initial commit without staging',()=>fixture(async root=>{
 const p=await initial.plan(root,identity);await fs.writeFile(path.join(root,'package.json'),'{"name":"changed"}');
 await assert.rejects(initial.commit(root,p,identity),/changed during review/);
 assert.equal(git(root,'ls-files'),'');
}));
test('initial review refuses existing staged files or mismatched origin',()=>fixture(async root=>{
 await assert.rejects(initial.plan(root,{owner:'other',name:'app'}),/origin/);
 git(root,'add','package.json');await assert.rejects(initial.plan(root,identity),/staged files/);
 assert.equal(git(root,'ls-files'),'package.json');
}));
test('unsafe filenames and sensitive contents are excluded',()=>{
 for(const name of ['.env.local','a/.npmrc','node_modules/foo.js','private/key.js','tokens.json','../escape.js','credentials.yml'])assert.equal(initial.safeName(name),false,name);
 assert.equal(initial.safeText(Buffer.from('-----BEGIN PRIVATE KEY-----')),false);
 assert.equal(initial.safeText(Buffer.from('const password = "example-secret"')),false);
 assert.equal(initial.safeName('ReactTS_Frontend/src/App.tsx'),true);
});
test('Install & Run offers first-commit review before invoking execution',async()=>{
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8'),host=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 assert.doesNotMatch(ui,/singleRun\.disabled=[\s\S]{0,150}!current\.sha/);
 assert.match(ui,/Commit|commit/);
 const flow=host.slice(host.indexOf("case 'architectCustomInstallRun':"),host.indexOf("case 'architectCustomRun':"));
 assert.ok(flow.indexOf('initialCommit.plan(')<flow.indexOf('approved=await uiWarning('));
 assert.ok(flow.indexOf('if(consentCancelled||approved!==action)')<flow.indexOf('initialCommit.commit('));
 assert.ok(flow.indexOf('initialCommit.commit(')<flow.indexOf('workflow.installAndRun('));
 assert.match(flow,/expectedSha:inspected.sha,prepareBaseline/);
 assert.match(ui,/m.type==='architectCustomBaselineResult'/);
});

test('cancelled initial-commit review does not stage files',()=>fixture(async root=>{
 const p=await initial.plan(root,identity),controller=new AbortController();
 controller.abort();await assert.rejects(initial.commit(root,p,{...identity,signal:controller.signal}),/cancelled/);
 assert.equal(git(root,'ls-files'),'');
}));
test('first-commit callback is protected by the running workflow cancellation state',async()=>{
 const workflow=require('../src/architect-custom-workflow'),root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-first-run-'));
 try{let called=false;
 await assert.rejects(workflow.installAndRun(root,{driver:{localLogs:()=>({running:false})},stack:{scan:async()=>({sha:'',targets:[{relative:'web',runnable:true,mockable:true,role:'frontend'}]})},prepareBaseline:async signal=>{called=true;assert.equal(workflow.isPending(root),true);assert.equal(workflow.cancel(root),true);assert.equal(signal.aborted,true);return 'a'.repeat(40);}}),/cancelled/);
 assert.equal(called,true);assert.equal(workflow.isPending(root),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('explicit local-only first commit permits differing origin without changing it',()=>fixture(async root=>{
 const options={owner:'other',name:'app',allowLocalOrigin:true};
 const p=await initial.plan(root,options);
 assert.equal(p.remote,'https://github.com/acme/app.git');
 const result=await initial.commit(root,p,options);
 assert.match(result.sha,/^[a-f0-9]{40}$/);
 assert.equal(git(root,'remote','get-url','origin'),'https://github.com/acme/app.git');
}));
