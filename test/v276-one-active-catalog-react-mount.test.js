'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const catalog=require('../src/github-sdlc-catalog');
const tdd=require('../src/developer-tdd');
const shaA='a'.repeat(40),shaB='b'.repeat(40);
async function setup(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv276-'));
 const ws=path.join(root,'project'),store=path.join(root,'cache');
 const config={repositoryUrl:'https://github.com/example-org/tech-stacks-skills',ref:'main'};
 const cache=path.join(store,'library','example-org','tech-stacks-skills');
 await fs.mkdir(path.join(ws,'.atgv'),{recursive:true});
 for(const sha of [shaA,shaB]){
  const dir=path.join(cache,sha);await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'catalog.json'),JSON.stringify({schema:1,version:'1.1.0',roles:[],techStacks:[]}));
  await fs.writeFile(path.join(dir,'atgv-catalog-lock.json'),JSON.stringify({sha,repository:'example-org/tech-stacks-skills',ref:'main',version:'1.1.0',roleCount:0,stackCount:0}));
 }
 async function point(sha){await fs.writeFile(path.join(cache,'active.json'),JSON.stringify({sha,repository:'example-org/tech-stacks-skills',ref:'main'}));}
 return {root,ws,store,config,point,base:path.join(ws,'.atgv','catalog-assets')};
}
test('activating a new catalog keeps one verified SHA asset directory',async()=>{
 const x=await setup();try{
  await x.point(shaA);await catalog.activateWorkspace(x.config,x.store,x.ws);
  await x.point(shaB);const result=await catalog.activateWorkspace(x.config,x.store,x.ws);
  assert.equal(result.removedOldVersions,1);
  assert.deepEqual((await fs.readdir(x.base)).sort(),['active.json',shaB]);
  const active=JSON.parse(await fs.readFile(path.join(x.base,'active.json'),'utf8'));
  assert.equal(active.sha,shaB);
  // The global verified cache remains for audit/other workspaces.
  assert.equal((await fs.stat(path.join(x.store,'library','example-org','tech-stacks-skills',shaA))).isDirectory(),true);
 }finally{await fs.rm(x.root,{recursive:true,force:true});}
});
test('edited old assets and unrelated workspace files are preserved',async()=>{
 const x=await setup();try{
  await x.point(shaA);await catalog.activateWorkspace(x.config,x.store,x.ws);
  await fs.writeFile(path.join(x.base,shaA,'catalog.json'),'local edits');
  await fs.mkdir(path.join(x.base,'user-assets'),{recursive:true});
  await fs.writeFile(path.join(x.base,'user-assets','keep.txt'),'keep');
  await x.point(shaB);const result=await catalog.activateWorkspace(x.config,x.store,x.ws);
  assert.equal(result.removedOldVersions,0);
  assert.equal(result.preservedUnverifiedVersions,1);
  assert.equal(await fs.readFile(path.join(x.base,shaA,'catalog.json'),'utf8'),'local edits');
  assert.equal(await fs.readFile(path.join(x.base,'user-assets','keep.txt'),'utf8'),'keep');
 }finally{await fs.rm(x.root,{recursive:true,force:true});}
});
test('failed catalog activation cannot prune old active version',async()=>{
 const x=await setup();try{
  await x.point(shaA);await catalog.activateWorkspace(x.config,x.store,x.ws);
  await x.point(shaB);await fs.mkdir(path.join(x.base,shaB),{recursive:true});
  await fs.writeFile(path.join(x.base,shaB,'catalog.json'),'tampered');
  await assert.rejects(catalog.activateWorkspace(x.config,x.store,x.ws),/missing or modified|asset is missing or modified/);
  assert.equal((await fs.stat(path.join(x.base,shaA))).isDirectory(),true);
  assert.equal(JSON.parse(await fs.readFile(path.join(x.base,'active.json'))).sha,shaA);
 }finally{await fs.rm(x.root,{recursive:true,force:true});}
});
test('RED detects direct React browser entry imports and mounting in node tests',()=>{
 for(const snippet of ["import '../src/main.jsx'", "require('./src/main.jsx')", "await vite.ssrLoadModule('./src/main.jsx')", "ReactDOM.createRoot(document.getElementById('root'))"])
  assert.deepEqual(tdd.unsafeBrowserBootstrapTestPaths([{path:'server/br-007-ac12.test.mjs',content:snippet}]),['server/br-007-ac12.test.mjs']);
 assert.deepEqual(tdd.unsafeBrowserBootstrapTestPaths([{path:'server/br-007-ac12.test.mjs',content:"import {App} from '../src/App.jsx'"}]),[]);
});
test('React DOM bootstrapping fails RED infrastructure verification and gives GREEN clear root cause',()=>{
 const logs='(!) Failed to run dependency scan. Skipping dependency pre-bundling. Error: Failed to scan for dependencies from entries: Error: Target container is not a DOM element.';
 assert.equal(tdd.redInfrastructureFailure([{passed:false,logs}]),true);
 assert.match(tdd.frontendFailureDetails(logs),/createRoot received an invalid DOM node/);
 assert.match(tdd.extractGreenFailureDetails(logs),/React mount error/);
 assert.match(tdd.testsOnlyPrompt({brId:'BR-007',revision:1,brText:'',source:{files:[],previews:[]},criterion:{id:'AC-12',description:'UI'}}),/NEVER import a React browser bootstrap/);
 assert.match(tdd.greenPrompt({brId:'BR-007',revision:1,brText:'',source:{files:[],previews:[]},redEvidence:[]}),/never call createRoot\(null\)/);
});
test('GREEN rejects React mount point mismatch but leaves valid browser bootstrap intact',()=>{
 const html='<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>';
 assert.deepEqual(tdd.reactMountContractViolations([{path:'src/main.jsx',content:"import {createRoot} from 'react-dom/client'; createRoot(document.getElementById('root')).render(App);"}],html),[]);
 assert.match(tdd.reactMountContractViolations([{path:'src/main.jsx',content:"import {createRoot} from 'react-dom/client'; createRoot(document.getElementById('app')).render(App);"}],html)[0],/targets #app.*index.html/);
 assert.match(tdd.reactMountContractViolations([{path:'src/main.jsx',content:"const container=document.getElementById('missing'); ReactDOM.createRoot(container).render(App)"}],html)[0],/targets #missing/);
 assert.deepEqual(tdd.reactMountContractViolations([{path:'src/App.jsx',content:"createRoot(document.getElementById('missing'))"}],html),[]);
 assert.deepEqual(tdd.reactMountContractViolations([{path:'src/main.jsx',content:"createRoot(document.getElementById('app'))"}],''),[]);
});
