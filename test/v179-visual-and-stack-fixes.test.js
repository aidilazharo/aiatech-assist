'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const visual=require('../src/ux-design-visual');
const ux=require('../src/ux-ticket-designs');
const repos=require('../src/architect-repository');
const git=require('../src/developer-git');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const data={title:'Request <test>',summary:'A draft for approval',screens:[{name:'Equipment request',purpose:'Let the user find and request hardware',components:['Search equipment item','Select department','Available equipment inventory table','Continue button','Error status notice'],interactions:['Select an available item to continue']}],flows:[],assumptions:[],questions:[]};
async function inTemp(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv179-'));try{return await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('wireframe and mockup are real safe SVG screen images, not text lists',()=>{
 for(const kind of ['wireframe','mockup']){
  const images=visual.renderScreens(data,kind,'TC-296');assert.equal(images.length,1);
  const svg=images[0].svg;assert.match(svg,/<svg\s/);assert.match(svg,/<rect\s/);assert.match(svg,/<text\s/);
  assert.match(svg,/<\/svg>$/);assert.match(svg,/Equipment request/);
  assert.doesNotMatch(svg,/<script\b|onload\s*=|<foreignObject\b/i);
 }
 assert.match(visual.screenSvg({name:'<script>alert(1)</script>',components:['Bad <img src=x onerror=alert(1)>']},{kind:'mockup'}),/&lt;script&gt;/);
});
test('ticket design save persists actual SVG files and preview images, revision-safely',()=>inTemp(async root=>{
 const first=await ux.save(root,'TC-296','wireframe',data,'',{actor:'Tester'});
 assert.equal(first.exists,true);assert.equal(first.previews.length,1);
 assert.equal(first.images.length,1);assert.match(first.images[0],/wireframe-r1-screen-01\.svg$/);
 assert.match(await fs.readFile(path.join(root,first.images[0]),'utf8'),/<svg /);
 await assert.rejects(ux.save(root,'TC-296','wireframe',data,'',{actor:'Tester'}),/changed since loading/);
 const next=await ux.save(root,'TC-296','wireframe',data,first.revision,{actor:'Tester'});
 assert.match(next.images[0],/r2-screen-01/);assert.notEqual(next.revision,first.revision);
 const saved=await ux.read(root,'TC-296','wireframe');assert.equal(saved.previews[0].name,'Equipment request');
 assert.equal(saved.revision,next.revision);
}));
test('architect can find verified cloned project checkout even when local selection state was lost',()=>inTemp(async root=>{
 const checkout=path.join(root,'repository','tech-cockpit');await fs.mkdir(checkout,{recursive:true});
 execFileSync('git',['init','-q',checkout]);execFileSync('git',['-C',checkout,'remote','add','origin','https://github.com/example-org/tech-cockpit.git']);
 const cache=new Map();const state={get:key=>cache.get(key),update:async(key,value)=>cache.set(key,value)};
 const result=await repos.resolve(state,'project-1',git,{projectRoot:root,githubOwner:'example-org',githubRepo:'tech-cockpit'});
 assert.equal(result,checkout);assert.equal(cache.get('atgvAssist.localRepo.project-1'),checkout);
 await assert.rejects(repos.resolve(state,'project-1',git,{projectRoot:root,githubOwner:'someoneelse',githubRepo:'wrong'}),/different GitHub origin|No usable/);
}));
test('save action gives immediate feedback and generated SVG preview uses actual image elements',()=>{
 assert.match(ui,/Checking main, preparing the skeleton, installing, testing, launching and pushing/);
 assert.match(ui,/architectStackError/);assert.match(host,/architectureBootstrapResult/);
 assert.match(ui,/createElement\('img'\)/);assert.match(ui,/data:image\/svg\+xml/);
 assert.match(ui,/Expand Image/);
 assert.doesNotMatch(host,/const choice=await uiWarning\(`Save \$\{id\}/);
});

test('Save Stack prepared checkpoint survives project registry updates and enables progress',()=>inTemp(async root=>{
 const {ProjectRegistry}=require('../src/projects');
 const registry=new ProjectRegistry(root);
 const created=await registry.create({name:'Stack Checkpoint Test',techStackId:'react',settings:{}});
 const prepared={stackId:'react',companionId:'',root:path.join(root,'projects',created.id,'repository','tech-cockpit'),at:new Date().toISOString()};
 const saved=await registry.update(created.id,{...created,techStackPrepared:prepared});
 assert.equal(saved.techStackPrepared.root,prepared.root);
 const reread=await registry.read(created.id);
 assert.equal(reread.techStackPrepared.stackId,'react');
 const afterSettingsUpdate=await registry.update(created.id,{...reread,name:'Stack Checkpoint Test (updated)'});
 assert.equal(afterSettingsUpdate.techStackPrepared.root,prepared.root);
 const changed=await registry.update(created.id,{...afterSettingsUpdate,techStackId:'angular'});
 assert.equal(changed.techStackPrepared,null);
}));
