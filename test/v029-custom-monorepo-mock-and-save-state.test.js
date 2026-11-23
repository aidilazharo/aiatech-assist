'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const developer=require('../src/developer-git');
const custom=require('../src/architect-custom-stack');
const dependencies=require('../src/stack-dependency-helper');
const mock=require('../src/stack-mock-preview');
const read=file=>require('node:fs').readFileSync(path.join(__dirname,'..',file),'utf8');

async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-tech-cockpit-'));
 try{
  for(const name of ['ReactTS_Frontend','NestJS_Backend','docs'])await fs.mkdir(path.join(root,name));
  await fs.writeFile(path.join(root,'README.md'),'TechCockpit fixture\n');
  await fs.writeFile(path.join(root,'ReactTS_Frontend','vite.config.ts'),'export default {}');
  await fs.writeFile(path.join(root,'ReactTS_Frontend','package.json'),
    JSON.stringify({name:'frontend',scripts:{dev:'vite'},dependencies:{react:'^19'},devDependencies:{vite:'^8'}}));
  await fs.writeFile(path.join(root,'NestJS_Backend','package.json'),
    JSON.stringify({name:'backend',scripts:{'start:dev':'nest start --watch'},dependencies:{'@nestjs/core':'^12'}}));
  await fs.writeFile(path.join(root,'docs','package.json'),JSON.stringify({scripts:{dev:'not-an-app'}}));
  await exec('git',['init','-b','main'],{cwd:root});
  await exec('git',['add','.'],{cwd:root});
  await exec('git',['-c','user.name=ATGV','-c','user.email=atgv@example.invalid','commit','-m','fixture'],{cwd:root});
  await fn(root);
 }finally{await fs.rm(root,{recursive:true,force:true});}
}

test('Custom Stack discovers a two-app React Vite and NestJS monorepo with their correct URLs and scripts',async()=>{
 await fixture(async root=>{
  const inspected=await developer.inspectScripts(root);
  assert.deepEqual(inspected.targets.map(t=>t.relative).sort(),['NestJS_Backend','ReactTS_Frontend']);
  const scan=await custom.scan(root);
  assert.equal(scan.recognized,2);
  assert.equal(scan.ready,true);
  const frontend=scan.targets.find(t=>t.relative==='ReactTS_Frontend');
  const backend=scan.targets.find(t=>t.relative==='NestJS_Backend');
  assert.equal(frontend.framework,'React / Vite');
  assert.equal(frontend.previewUrl,'http://127.0.0.1:5173/');
  assert.equal(frontend.mockable,true);
  assert.equal(backend.framework,'NestJS');
  assert.equal(backend.runScript,'start:dev');
  assert.equal(backend.previewUrl,'http://127.0.0.1:3000/api/v1/health');
  assert.equal(backend.mockable,false);
 });
});

test('Nested dependency directories are verified inside checkout and cannot traverse outside',async()=>{
 await fixture(async root=>{
  assert.equal(await dependencies.directory(root,'ReactTS_Frontend'),path.join(root,'ReactTS_Frontend'));
  assert.equal(await dependencies.directory(root,'NestJS_Backend'),path.join(root,'NestJS_Backend'));
  await assert.rejects(dependencies.directory(root,'../elsewhere'),/Unsupported application directory/);
  await assert.rejects(dependencies.directory(root,'docs/../../../outside'),/Unsupported application directory/);
  const external=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-external-'));
  try{
   await fs.symlink(external,path.join(root,'linked-app'),'dir');
   await assert.rejects(dependencies.directory(root,'linked-app'),/Unsafe application directory/);
  }finally{await fs.rm(external,{recursive:true,force:true})}
 });
});

test('Mock Preview uses only local API stubs, visibly labels simulated data, and refuses real proxy fallback',()=>{
 const generated=mock.render({source:'vite.config.ts',port:5173});
 assert.match(generated,/GET \/api\/v1\/me/);
 assert.match(generated,/MOCK DATA - LOCAL PREVIEW/);
 assert.match(generated,/proxy: \{\}/);
 assert.match(generated,/status = 501/);
 assert.match(generated,/host: '127\.0\.0\.1'/);
 assert.match(generated,/vite\.config\.ts/);
 assert.throws(()=>mock.render({source:'../../outside.ts',port:5173}),/Invalid/);
 assert.throws(()=>mock.render({source:'vite.config.ts',port:0}),/Invalid/);
});

test('Mock execution is explicit, scoped to Vite and never silently selects a real backend',async()=>{
 await fixture(async root=>{
  const sha=(await developer.repository(root)).sha;
  let called=null,installed=false,active=false;
  const driver={
   inspectScripts:()=>developer.inspectScripts(root),
   localLogs:()=>({running:active,cwd:path.join(root,'ReactTS_Frontend'),instanceId:''}),
   runLocal:async(_root,options)=>{called=options;active=true},
   stopLocal:async()=>{active=false}
  };
  const helper={ensureForTarget:async(_root,target)=>{assert.equal(target.relative,'ReactTS_Frontend');installed=true}};
  const bootstrapApi={waitForHttp:async()=>true};
  const httpRequest=async url=>String(url).includes('/api/v1/health')
   ?{ok:true,headers:{get:name=>name==='x-atgv-mock-preview'?'true':'application/json'},json:async()=>({status:'mock',database:'simulated'})}
   :{ok:true,headers:{get:name=>name==='content-type'?'text/html; charset=utf-8':''},body:{cancel:async()=>{}}};
  const result=await custom.run(root,{sha,relative:'ReactTS_Frontend',mock:true,driver,helper,bootstrapApi,httpRequest});
  assert.equal(result.mockPreview,true);
  assert.equal(installed,true);
  assert.equal(called.mockPreview,true);
  assert.match(result.message,/MOCK DATA/);
  active=false;
  await assert.rejects(custom.run(root,{sha,relative:'NestJS_Backend',mock:true,driver,helper,bootstrapApi}),/only supported for detected Vite/);
 });
});

test('Save Stack remains green and disabled after save, re-enables blue on user selection change',()=>{
 const js=read('media/start.js'),css=read('media/start.css');
 const a=js.indexOf('function syncArchitectStackButtons(project){');
 const b=js.indexOf('\nlet roleJiraProject=',a);
 assert.ok(a>0&&b>a);
 const code=js.slice(a,b);
 const elements={
  architectStackSelect:{value:'custom'},
  architectSaveStack:{disabled:false,textContent:'',title:'',setAttribute(){},classList:{saved:false,toggle(_name,value){this.saved=value}}},
  architectResetStack:{},architectTestStack:{},architectApproveStack:{}
 };
 const instance=new Function('$','architectServerRequirementReady',`
  let activeId='demo',architectActionBusy=false,
   architectSaveSelectionProjectId='',architectSaveSelectionChanged=false;
  ${code}
  return {
   render:project=>syncArchitectStackButtons(project),
   busy:value=>{architectActionBusy=value},
   changed:()=>{architectSaveSelectionProjectId=activeId;architectSaveSelectionChanged=true},
   saved:()=>{architectSaveSelectionChanged=false},
   project:id=>{activeId=id}
  }
 `)(id=>elements[id],()=>false);
 const saved={techStackId:'custom'};
 const catalog={techStackId:'react',techStackPrepared:{stackId:'react',branch:'migration/react-catalog-1-1-14-07bbe5e6',remotePushed:true}};
 instance.render(catalog);
 assert.equal(elements.architectSaveStack.textContent,'Switch & Save Stack');
 assert.equal(elements.architectSaveStack.disabled,false);
 assert.equal(elements.architectResetStack.disabled,false);
 instance.busy(true);
 instance.render(catalog);
 assert.equal(elements.architectResetStack.disabled,true);
 instance.busy(false);
 instance.render(saved);
 assert.equal(elements.architectSaveStack.disabled,true);
 assert.equal(elements.architectSaveStack.classList.saved,true);
 assert.equal(elements.architectSaveStack.textContent,'Saved Stack');
 instance.changed();
 instance.render(saved);
 assert.equal(elements.architectSaveStack.disabled,false);
 assert.equal(elements.architectSaveStack.classList.saved,false);
 assert.equal(elements.architectSaveStack.textContent,'Save Stack');
 instance.saved();
 instance.render(saved);
 assert.equal(elements.architectSaveStack.disabled,true);
 elements.architectStackSelect.value='react';
 instance.changed();
 instance.render(saved);
 assert.equal(elements.architectSaveStack.disabled,false);
 instance.project('another-project');
 instance.render({techStackId:'react',techStackPrepared:{stackId:'react'}});
 assert.equal(elements.architectSaveStack.disabled,true);
 assert.match(css,/#workView #architectSaveStack\.atgv-stack-saved:disabled\{[^}]*background:#138c50!important/);
 assert.match(js,/architectSavePendingSelection\.stackId===\$\('architectStackSelect'\)\.value/);
 assert.match(js,/architectSaveSelectionChanged=true/);
});

test('Custom Stack mocks are accessible and host action requires an explicit confirmation',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const js=read('media/start.js');
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.match(html,/id="architectCustomMockRun"/);
 assert.match(js,/send\('architectCustomRun',\{projectId:activeId,sha:architectCustomInfo\.sha,relative:selected\.relative,previewUrl:\$\('architectCustomPreviewUrl'\)\.value\.trim\(\),mock:true\}\)/);
 assert.match(host,/const mock=msg\.mock===true/);
 assert.match(host,/MOCK DATA: ATGV will install/);
 assert.match(host,/custom\.run\(root,\{sha:inspection\.sha,relative:chosen\.relative,previewUrl:url,mock,/);
});
