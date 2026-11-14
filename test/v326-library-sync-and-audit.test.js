'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const library=require('../src/sdlc-library-studio');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
const extension=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
class Element {
 constructor(tag='div'){
  this.tagName=tag;this.listeners={};this.children=[];this.value='';this.textContent='';this.disabled=false;this.readOnly=false;this.options=[];this.selectedIndex=0;this.checked=false;
  const set=new Set();this.classList={contains:x=>set.has(x),add:x=>set.add(x),remove:x=>set.delete(x),toggle:(x,force)=>{const present=force===undefined?!set.has(x):force;present?set.add(x):set.delete(x);return present;}};
 }
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 click(){(this.listeners.click||[]).forEach(fn=>fn({target:this}));}
 fire(name){(this.listeners[name]||[]).forEach(fn=>fn({target:this}));}
 focus(){}
 setAttribute(){}
 append(...children){this.children.push(...children);if(this.tagName==='select')this.options.push(...children);}
 replaceChildren(...children){this.children=[...children];if(this.tagName==='select')this.options=[...children];}
 prepend(item){this.children.unshift(item);}
 remove(){}
}
function view(){
 const nodes=new Map(),callbacks={},messages=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id==='libraryCategory'?'select':'div'));return nodes.get(id);};
 get('libraryCategory').value='All';get('libraryScope').value='user';
 get('libraryScope').options=[{text:'User',value:'user'}];
 const document={getElementById:get,createElement:tag=>new Element(tag),querySelector:()=>({})};
 const window={addEventListener:(name,fn)=>callbacks[name]=fn};
 vm.runInNewContext(ui,{document,window,send:(type,body)=>messages.push({type,body})},{timeout:1500});
 const receive=msg=>callbacks.message({data:msg});
 const pathName='ai-harness/skills/dev-tdd-repair/SKILL.md';
 const resource={path:pathName,category:'AI Skills',content:'# Old shared skill\nSafe instructions\n',shared:'# Old shared skill\nSafe instructions\n',source:'shared',scope:'user',hasLocal:false,updateAvailable:false,hash:'a'};
 receive({type:'libraryList',items:[{name:'dev-tdd-repair',path:pathName,category:'AI Skills'}],total:1,categories:['AI Skills'],catalog:{version:'1.1.6',sha:'a'.repeat(40)}});
 receive({type:'libraryResource',value:resource});
 return {get,messages,receive,window,resource};
}
test('Check Catalog Updates shows an accessible refresh icon and uses the existing sync action',()=>{
 assert.match(extension, /id=\"libraryCheckUpdates\"[^>]*><svg class=\"library-sync-icon\"/);
 assert.match(extension, /library-sync-icon[^>]*aria-hidden=\"true\"/);
});
test('Check Catalog Updates runs one-click verified Git sync, blocks repeated clicks and restores preview',()=>{
 const v=view();v.get('libraryCheckUpdates').click();
 const request=v.messages.at(-1);
 assert.equal(request.type,'librarySync');assert.equal(request.body.selectedPath,v.resource.path);
 assert.equal(request.body.category,'All');
 assert.equal(v.get('libraryCheckUpdates').disabled,true);
 assert.equal(v.get('libraryCheckUpdates').classList.contains('is-syncing'),true);
 v.get('libraryCheckUpdates').click();assert.equal(v.messages.filter(x=>x.type==='librarySync').length,1);
 v.receive({type:'libraryList',items:[{name:'dev-tdd-repair',path:v.resource.path,category:'AI Skills'}],total:1,categories:['AI Skills'],catalog:{version:'1.1.7',sha:'b'.repeat(40)}});
 const updated={...v.resource,content:'# Updated shared skill\nSafe instructions\n',shared:'# Updated shared skill\nSafe instructions\n',hash:'b'};
 v.receive({type:'libraryResource',value:updated});
 v.receive({type:'librarySyncResult',success:true,message:'Catalog updated, local overrides preserved.'});
 assert.equal(v.get('libraryEditor').value,updated.content);
 assert.equal(v.get('libraryEditor').readOnly,true);
 assert.equal(v.get('libraryCheckUpdates').disabled,false);
 assert.equal(v.get('libraryCheckUpdates').classList.contains('is-syncing'),false);
 assert.match(v.get('libraryActionStatus').textContent,/updated/);
});
test('Cannot sync with unsaved changes; errors keep installed catalog preview intact',()=>{
 const v=view();v.get('libraryEdit').click();v.get('libraryEditor').value+='local change';v.get('libraryEditor').fire('input');
 v.get('libraryCheckUpdates').click();assert.equal(v.messages.filter(x=>x.type==='librarySync').length,0);
 assert.match(v.get('libraryActionStatus').textContent,/Save Local or Cancel/);
 v.get('libraryCancel').click();v.get('libraryCheckUpdates').click();
 v.receive({type:'librarySyncResult',success:false,message:'Catalog sync failed; previous library retained.'});
 assert.equal(v.get('libraryEditor').value,v.resource.content);
 assert.equal(v.get('libraryEditor').readOnly,true);
 assert.equal(v.get('libraryCheckUpdates').disabled,false);
 assert.equal(v.get('libraryCheckUpdates').classList.contains('is-syncing'),false);
 assert.match(v.get('libraryActionStatus').textContent,/previous library retained/);
});
test('Supporting Files is a Category choice, not a separate toggle',()=>{
 const v=view();v.get('libraryCategory').value='Supporting Files';v.get('libraryCategory').fire('change');
 assert.equal(v.messages.at(-1).type,'libraryList');assert.equal(v.messages.at(-1).body.category,'Supporting Files');
 assert.doesNotMatch(extension,/id=\"libraryShowSupporting\"/);
 assert.doesNotMatch(extension,/Browse approved GitHub resources, edit isolated local overrides/);
 assert.match(extension,/case 'librarySync':\{/);
 assert.match(extension,/sdlcCatalog\.syncGitWorkspace\(config,token,workspace,context\.globalStorageUri\.fsPath\)/);
});
test('curated library hides secondary Markdown docs, examples and scripts without deleting their files',async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-v326-clean-library-'));
 const catalog=path.join(base,'catalog'),storage=path.join(base,'private'),workspace=path.join(base,'workspace');
 const files={
  'roles/software-developer/SKILL.md':'# Software developer',
  'roles/software-developer/README.md':'Documentation',
  'ai-harness/skills/dev-tdd-green/SKILL.md':'# Green',
  'ai-harness/skills/dev-tdd-green/skill.json':'{}',
  'ai-harness/README.md':'Harness details',
  'ai-harness/workflows/developer-tdd.json':'{}',
  'ai-harness/scripts/validate.mjs':'console.log(123)',
  'shared/design-systems/aia-qi/kit/examples/dashboard.html':'<main></main>',
  'shared/design-systems/aia-qi/AI-GUIDANCE.md':'# Guidance',
  'shared/document-templates/test-plan.md':'# Template',
  'tech-stacks/react/stack.json':'{}',
  'tech-stacks/react/README.md':'Help'
 };
 try{
  await fsp.mkdir(workspace);for(const [p,contents] of Object.entries(files)){const target=path.join(catalog,p);await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.writeFile(target,contents);}
  const params={root:catalog,storage,workspace,repositoryUrl:'https://github.com/example/shared-sdlc'};
  const clean=await library.listing(params);
  assert.ok(clean.items.some(x=>x.path==='roles/software-developer/SKILL.md'));
  assert.ok(clean.items.some(x=>x.path==='shared/document-templates/test-plan.md'));
  assert.ok(clean.items.some(x=>x.path==='tech-stacks/react/stack.json'));
  assert.ok(!clean.items.some(x=>x.path.endsWith('/README.md')));
  assert.ok(!clean.items.some(x=>x.path==='ai-harness/scripts/validate.mjs'));
  assert.ok(!clean.items.some(x=>x.path.includes('examples/dashboard.html')));
  const all=await library.listing({...params,includeSupporting:true});
  assert.equal(all.total,Object.keys(files).length);
  assert.ok(all.items.some(x=>x.path==='ai-harness/README.md'));
  assert.equal(await fsp.readFile(path.join(catalog,'ai-harness','README.md'),'utf8'),'Harness details');
 } finally{await fsp.rm(base,{force:true,recursive:true});}
});
