'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), fsp=require('node:fs/promises'), path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const catalog=require('../src/github-sdlc-catalog');
const root=path.resolve(__dirname,'..');
const webview=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const html=host;
test('the activated catalog declares and loads AIA QI and Bootstrap v5.3',async()=>{
 const workspace=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-278-catalog-'));
 try{
  const sha='f'.repeat(40),base=path.join(workspace,'.atgv','catalog-assets'),root=path.join(base,sha);
  const ids=['aia-qi','bootstrap-5.3'];
  const kits={};
  for(const id of ids){
   const prefix='shared/design-systems/'+id+'/kit/';
   kits[id]={label:id==='aia-qi'?'AIA QI':'Bootstrap v5.3',kitVersion:'1.0.0',components:prefix+'ai/component-catalog.json',tokens:prefix+'tokens/tokens.json',css:prefix+'css/style.css'};
   for(const filename of [kits[id].components,kits[id].tokens,kits[id].css]){
    await fsp.mkdir(path.join(root,path.dirname(filename)),{recursive:true});
    await fsp.writeFile(path.join(root,filename),'{}');
   }
  }
  await fsp.mkdir(base,{recursive:true});
  await fsp.writeFile(path.join(base,'active.json'),JSON.stringify({sha,ref:'main',version:'1.1.2',repository:'example-org/tech-stacks-skills'}));
  await fsp.writeFile(path.join(root,'catalog.json'),JSON.stringify({schema:1,version:'1.1.2',techStacks:[],roles:[],designSystems:ids,designSystemCatalogs:kits}));
  const result=await catalog.designFrameworkAvailability(workspace);
  assert.equal(result.declared,2);
  assert.deepEqual(result.frameworks.map(x=>x.id),ids);
  assert.deepEqual(result.frameworks.map(x=>x.label),['AIA QI','Bootstrap v5.3']);
  assert.equal(result.unavailable.length,0);
 }finally {await fsp.rm(workspace,{recursive:true,force:true});}
});

test('the actual webview picker renderer creates two options and keeps approved design read-only',()=>{
 const start=webview.indexOf('function renderUxFrameworkOptions(');
 const end=webview.indexOf('function setUxRejectFeedback(',start);
 assert.ok(start>0&&end>start);
 const options=[];
 const picker={ value:'',disabled:true, replaceChildren(){options.length=0;},append(option){options.push(option);} };
 const ctx={
  uxFramework:'',uxFrameworks:[],uxPipelineBusy:false,
  uxPipeline:{exists:true,status:'approved'},
  $:()=>picker,updateUxFrameworkDocs:()=>{},
  document:{createElement:()=>({value:'',textContent:''})},
 };
 vm.runInNewContext(webview.slice(start,end),ctx);
 vm.runInNewContext("renderUxFrameworkOptions([{id:'aia-qi',label:'AIA QI'},{id:'bootstrap-5.3',label:'Bootstrap v5.3'}], 'aia-qi')",ctx);
 assert.deepEqual(options.map(x=>x.textContent),['AIA QI','Bootstrap v5.3']);
 assert.match(webview,/a-z0-9_\.\-/,'picker ID validation must accept dots');
 assert.equal(picker.value,'aia-qi');
 assert.equal(picker.disabled,false,'allow inspecting options even when design is approved');
});

test('frameworks are asynchronously refreshed from Git main and the webview handles updates and Git failures',()=>{
 assert.match(host,/async function refreshUxFrameworkCatalog\(/);
 assert.match(host,/sdlcCatalog\.syncGitWorkspace\(conf,token,workspace/);
 assert.match(host,/type:'uxFrameworkCatalogChanged',projectId,\.\.\.available,autoRefreshed:true/);
 assert.match(host,/void refreshUxFrameworkCatalog\(getWorkspace\(\)\?\.uri\.fsPath,activeProject\.id\)/);
 assert.match(webview,/if\(m\.type==='uxFrameworkCatalogChanged'\)\{renderUxFrameworkOptions\(m\.frameworks/);
 assert.match(webview,/if\(m\.type==='uxFrameworkCatalogRefreshError'\)/);
});

test('manual refresh and provenance are visible even with no Jira ticket',()=>{
 assert.match(html,/id="uxFrameworkSync"/);
 assert.match(html,/id="uxFrameworkSource"/);
 assert.match(webview,/send\('uxFrameworkSync',\{key:uxSelectedKey\|\|''\}\)/);
 assert.match(webview,/Catalog '\+String\(data\.snapshot\?\.version/);
 assert.match(host,/case 'uxFrameworkSync':/);
 assert.match(webview,/This design is locked to /);
});
