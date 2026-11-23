'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const catalog=require('../src/github-sdlc-catalog');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const css=require('node:fs').readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const sha='e'.repeat(40);
async function prepare(){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'atgv241activate-'));
 const store=path.join(home,'storage'),workspace=path.join(home,'project');
 const base=path.join(store,'library','example-org','tech-stacks-skills');
 const source=path.join(base,sha);
 await fs.mkdir(source,{recursive:true});await fs.mkdir(path.join(workspace,'.atgv'),{recursive:true});
 const config={repositoryUrl:'https://github.com/example-org/tech-stacks-skills',ref:'main'};
 const manifest={schema:1,version:'1.1.2',roles:[],techStacks:[],designSystems:['aia-qi','bootstrap-5.3'],designSystemCatalogs:{}};
 const files={'catalog.json':JSON.stringify(manifest)};
 for(const id of manifest.designSystems){
  const root='shared/design-systems/'+id+'/kit';
  manifest.designSystemCatalogs[id]={components:root+'/ai/component-catalog.json',tokens:root+'/tokens/tokens.json',css:root+'/css/ui.css',label:id};
  files[manifest.designSystemCatalogs[id].components]=JSON.stringify({version:'1.0.0',components:[{name:'Button',category:'action',classes:[id==='aia-qi'?'qi-btn':'btn']} ]});
  files[manifest.designSystemCatalogs[id].tokens]=JSON.stringify({color:{primary:{500:'#d31145'}}});
  files[manifest.designSystemCatalogs[id].css]='.btn { display: inline-block; }';
 }
 files['catalog.json']=JSON.stringify(manifest);
 for(const [name,value] of Object.entries(files)){const file=path.join(source,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);}
 await fs.writeFile(path.join(source,'atgv-catalog-lock.json'),JSON.stringify({sha,ref:'main',repository:'example-org/tech-stacks-skills',version:'1.1.2',roleCount:18,stackCount:5}));
 await fs.writeFile(path.join(base,'active.json'),JSON.stringify({sha,ref:'main',repository:'example-org/tech-stacks-skills'}));
 return {home,store,workspace,config,source,files};
}
test('activation repairs a missing framework file from verified global cache and preserves revision pointer',async()=>{
 const setup=await prepare();try{
  await catalog.activateWorkspace(setup.config,setup.store,setup.workspace);
  const first=await catalog.designFrameworkAvailability(setup.workspace);
  assert.deepEqual(first.frameworks.map(x=>x.id),['aia-qi','bootstrap-5.3']);
  const file=path.join(setup.workspace,'.atgv','catalog-assets',sha,'shared','design-systems','bootstrap-5.3','kit','css','ui.css');
  await fs.rm(file);
  let availability=await catalog.designFrameworkAvailability(setup.workspace);
  assert.deepEqual(availability.frameworks.map(x=>x.id),['aia-qi']);
  await catalog.activateWorkspace(setup.config,setup.store,setup.workspace);
  availability=await catalog.designFrameworkAvailability(setup.workspace);
  assert.deepEqual(availability.frameworks.map(x=>x.id),['aia-qi','bootstrap-5.3']);
 }finally{await fs.rm(setup.home,{recursive:true,force:true});}
});
test('tampered workspace catalog cannot be overwritten by reactivation',async()=>{
 const setup=await prepare();try{
  await catalog.activateWorkspace(setup.config,setup.store,setup.workspace);
  const file=path.join(setup.workspace,'.atgv','catalog-assets',sha,'shared','design-systems','bootstrap-5.3','kit','css','ui.css');
  await fs.writeFile(file,'Modified by another program');
  await assert.rejects(catalog.activateWorkspace(setup.config,setup.store,setup.workspace),/asset is missing or modified/);
  assert.equal(await fs.readFile(file,'utf8'),'Modified by another program');
 }finally{await fs.rm(setup.home,{recursive:true,force:true});}
});
test('framework dropdown selection save keeps its full options, and stale SHA can be reactivated',()=>{
 const save=host.slice(host.indexOf("case 'uxFrameworkSave':{"),host.indexOf("case 'uxFrameworkCopyMarkup':{"));
 assert.match(save,/designFrameworkAvailability/);
 assert.match(save,/\.\.\.availability/);
 assert.match(host,/case 'uxFrameworkReactivate':\{/);
 assert.match(host,/updateAvailable=!!installed\?\.sha/);
 assert.match(ui,/if\(!Array\.isArray\(frameworks\)\)/);
 assert.match(ui,/renderUxFrameworkAvailability\(m\)/);
 assert.match(ui,/uxFrameworkCatalogChanged/);
});
test('catalogue style guide opens embedded in work view without creating a VS Code tab or running downloaded code',()=>{
 const handler=host.slice(host.indexOf("case 'uxFrameworkOpenDocs':{"),host.indexOf("case 'uxPrototypeOpenBrowser':{"));
 assert.match(handler,/uxFrameworkCatalogueLoaded/);
 assert.doesNotMatch(handler,/createWebviewPanel|executeCommand|openExternal|enableScripts/);
 assert.match(host,/id="uxFrameworkRightPane"/);
 assert.match(host,/id="uxGuideSearch"/);
 assert.match(css,/#workView #uxDesignWorkspace\.ux-guide-open/);
 assert.match(ui,/function renderUxFrameworkGuide/);
 assert.match(ui,/function uxGuideDraw/);
 assert.match(ui,/function uxGuidePreview/);
 assert.match(ui,/createElement\(tag\)/);
 assert.doesNotMatch(ui.slice(ui.indexOf('function uxGuideNode('),ui.indexOf('function updateUxFrameworkDocs(){')),/\.innerHTML\s*=/);
});
