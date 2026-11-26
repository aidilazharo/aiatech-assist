'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const catalog=require('../src/github-sdlc-catalog');
const reconcile=require('../src/architect-server-verification');
const gate=require('../src/architect-stack-approval');
const showcase=require('../src/ux-framework-showcase');
const code=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const remoteRoot=path.resolve(__dirname,'../../atgv-v0.2.38-repo/tech-stacks-skills-main');
const sha='a'.repeat(40);
const prepared={stackId:'react',root:'/tmp/stack',sha,branch:'bootstrap/react-initial',companionId:''};
const validation={status:'tested',stackId:'react',sha,companionId:''};
const project={techStackId:'react',techStackCompanionId:'',techStackPrepared:prepared,techStackValidation:validation};
const healthy={running:true,healthy:true,sha,branch:prepared.branch,url:'http://127.0.0.1:5173/'};
test('server evidence is recorded only for healthy ATGV-owned saved + tested revision',()=>{
 const proof=reconcile.evidenceIfHealthy(project,healthy);
 assert.ok(proof);assert.equal(proof.sha,sha);
 assert.equal(gate.serverVerified({...project,techStackServerVerification:proof}),true);
 for(const state of [{...healthy,healthy:false},{...healthy,running:false},{...healthy,sha:'b'.repeat(40)},{...healthy,url:'https://example.com'}]){
  assert.equal(reconcile.evidenceIfHealthy(project,state),null);
 }
 assert.equal(reconcile.evidenceIfHealthy({...project,techStackValidation:null},healthy),null);
 assert.equal(reconcile.evidenceIfHealthy({...project,techStackPrepared:{...prepared,sha:'b'.repeat(40)}},healthy),null);
 assert.equal(reconcile.evidenceIfHealthy({...project,techStackValidation:{...validation,sha:'b'.repeat(40)}},healthy),null);
});
test('Save Stack persists server proof rather than setting Pending after healthy bootstrap',()=>{
 const block=code.slice(code.indexOf("case 'architectSaveStack':{"),code.indexOf("case 'architectTestStack':{"));
 assert.match(block,/reconcileAfterSave/);
 assert.match(block,/registry\.update\(activeProject\.id,savedProject\)/);
 assert.match(block,/serverModule\.verify\(\{root:result\.repo\.root,stackId:id\}\)/);
 assert.match(block,/architectServerState/);
 assert.match(code,/case 'architectServerStatus':\{/);
 assert.match(code,/state=await require\(\'\.\/architect-server\'\)\.verify/);
 assert.match(code,/await refreshDashboard\(\)/);
 assert.match(ui,/architectLiveServerReady/);
});
test('framework picker is catalogue backed and both frameworks render in isolated VS Code webview',()=>{
 assert.match(code,/sdlcCatalog\.designFrameworks\(getWorkspace\(\)\?\.uri\.fsPath\)/);
 assert.match(code,/catalog\.designReference\(workspaceRoot,framework\)/);
 assert.match(code,/catalog\.designComponentsReference\(workspaceRoot,framework\)/);
 assert.doesNotMatch(code,/https:\/\/getbootstrap\.com\/docs\/5\.3\/components/);
 assert.match(code,/uxFrameworkCatalogueLoaded/);assert.doesNotMatch(code.slice(code.indexOf("case 'uxFrameworkOpenDocs':{"),code.indexOf("case 'uxPrototypeOpenBrowser':{")),/createWebviewPanel/);
 assert.match(ui,/renderUxFrameworkOptions\(m\.frameworks,m\.value\)/);
 const rendered=showcase.render({version:'5.3.6',components:[{name:'Button',category:'actions',classes:['btn','btn-primary']}]},{frameworkId:'bootstrap-5.3',frameworkLabel:'Bootstrap v5.3',version:'1.1.2'});
 assert.match(rendered,/Bootstrap v5\.3 component catalogue/);
 assert.doesNotMatch(rendered,/Qi-inspired adaptation/);
 assert.doesNotMatch(rendered,/<script\b/);
});
test('catalog v1.1.2 declares both full design kits and the CSS and JS match Bootstrap 5.3.6',t=>{
 if(!fs.existsSync(remoteRoot))return t.skip('External reference catalogue is not bundled in the extension source.');
 const manifest=JSON.parse(fs.readFileSync(path.join(remoteRoot,'catalog.json'),'utf8'));
 const entries=new Set();
 for(const dir of ['roles','shared','tech-stacks']){
  const walk=(p)=>{for(const name of fs.readdirSync(p)){const file=path.join(p,name);if(fs.statSync(file).isDirectory())walk(file);else entries.add(path.relative(remoteRoot,file).split(path.sep).join('/'));}};
  walk(path.join(remoteRoot,dir));
 }
 assert.equal(catalog.inspectManifest(Buffer.from(JSON.stringify(manifest)),entries).version,'1.1.2');
 assert.deepEqual(manifest.designSystems,['aia-qi','bootstrap-5.3']);
 const base=path.join(remoteRoot,'shared/design-systems/bootstrap-5.3');
 assert.match(fs.readFileSync(path.join(base,'kit/css/bootstrap.min.css'),'utf8').slice(0,250),/Bootstrap\s+v5\.3\.6/);
 assert.match(fs.readFileSync(path.join(base,'kit/js/bootstrap.bundle.min.js'),'utf8').slice(0,250),/Bootstrap v5\.3\.6/);
 const definitions=JSON.parse(fs.readFileSync(path.join(base,'kit/ai/component-catalog.json'),'utf8'));
 assert.equal(definitions.components.length,39);
 assert.ok(definitions.components.some(c=>c.name==='Modal'));
 assert.ok(definitions.components.some(c=>c.name==='Navbar'));
 assert.ok(definitions.components.some(c=>c.name==='Form controls'));
});
test('dynamic design frameworks require complete activated assets rather than just catalog labels',async()=>{
 const home=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv241-'));
 try{
  const base=path.join(home,'.atgv','catalog-assets');const snap=path.join(base,sha);
  await fsp.mkdir(snap,{recursive:true});
  await fsp.writeFile(path.join(base,'active.json'),JSON.stringify({sha,ref:'main',repository:'example-org/tech-stacks-skills',version:'1.1.2'}));
  const manifest={schema:1,version:'1.1.2',roles:[],techStacks:[],designSystems:['aia-qi','bootstrap-5.3'],designSystemCatalogs:{}};
  for(const id of manifest.designSystems){
   const prefix='shared/design-systems/'+id+'/kit';
   manifest.designSystemCatalogs[id]={label:id==='aia-qi'?'AIA QI':'Bootstrap v5.3',kitVersion:'1.0.0',components:prefix+'/ai/component-catalog.json',tokens:prefix+'/tokens/tokens.json',css:prefix+'/css/ui.css'};
   if(id==='aia-qi')for(const key of ['components','tokens','css']){
    const file=path.join(snap,manifest.designSystemCatalogs[id][key]);await fsp.mkdir(path.dirname(file),{recursive:true});await fsp.writeFile(file,'{}');
   }
  }
  await fsp.writeFile(path.join(snap,'catalog.json'),JSON.stringify(manifest));
  let status=await catalog.designFrameworkAvailability(home);
  assert.deepEqual(status.frameworks.map(f=>f.id),['aia-qi']);
  assert.equal(status.unavailable[0].id,'bootstrap-5.3');
  for(const key of ['components','tokens','css']){
   const file=path.join(snap,manifest.designSystemCatalogs['bootstrap-5.3'][key]);await fsp.mkdir(path.dirname(file),{recursive:true});await fsp.writeFile(file,'{}');
  }
  status=await catalog.designFrameworkAvailability(home);
  assert.deepEqual(status.frameworks.map(f=>f.id),['aia-qi','bootstrap-5.3']);
  assert.equal(status.unavailable.length,0);
 }finally{await fsp.rm(home,{recursive:true,force:true});}
});
