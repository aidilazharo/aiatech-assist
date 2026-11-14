'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const library=require('../src/sdlc-library-studio');
const ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
class El{
 constructor(){this.value='';this.textContent='';this.disabled=false;this.readOnly=false;this.checked=false;this.children=[];this.options=[];this.selectedIndex=0;this.listeners={};const names=new Set();this.classList={contains:n=>names.has(n),add:n=>names.add(n),remove:n=>names.delete(n),toggle:(n,f)=>{let yes=f===undefined?!names.has(n):f;yes?names.add(n):names.delete(n);return yes}};}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
 fire(k){for(const fn of this.listeners[k]||[])fn({target:this})}
 click(){this.fire('click')}
 focus(){}
 append(...x){this.children.push(...x);this.options.push(...x)}
 replaceChildren(...x){this.children=x;this.options=x}
 prepend(x){this.children.unshift(x)}
 setAttribute(){}
}
function view(){
 const nodes=new Map(),events={},messages=[];const $=id=>{if(!nodes.has(id))nodes.set(id,new El());return nodes.get(id)};
 $('libraryCategory').value='All';$('libraryScope').value='user';$('libraryScope').options=[{text:'User',value:'user'}];
 const mockCM={value:'',options:{},listeners:{},lineCount:()=>mockCM.value.split('\n').length,fromTextArea:null,
  getValue(){return this.value},setValue(v){this.value=v;this.listeners.change?.()},setOption(k,v){this.options[k]=v},on(k,fn){this.listeners[k]=fn},
  focus(){},refresh(){},addLineClass(){},removeLineClass(){}};
 const codeMirrorFactory=function(){};codeMirrorFactory.fromTextArea=(el,opt)=>{mockCM.options={...opt};return mockCM;};
 const window={addEventListener:(k,fn)=>events[k]=fn,CodeMirror:codeMirrorFactory};
 // CodeMirror is an external prebundled class. The webview controller must read
 // from the live editor instead of the hidden textarea.
 vm.runInNewContext(ui,{window,document:{getElementById:$,createElement:()=>new El(),querySelector:()=>null},send:(type,body)=>messages.push({type,body})},{timeout:1500});
 const recv=msg=>events.message({data:msg});
 const res={path:'ai-harness/agents/business-analyst.json',category:'AI Harness',source:'shared',content:'{"id":"BA"}\n',shared:'{"id":"BA"}\n',hasLocal:false,updateAvailable:false,hash:'base'};
 recv({type:'libraryResource',value:res});return {$,messages,recv,res,cm:mockCM,window};
}
test('approved CodeMirror library is loaded from the verified catalog cache before Library Studio',()=>{
 assert.match(html,/cmFiles\.map\(file=>`<script src="\$\{cmAsset\(file\)\}"><\/script>`\)/);
 assert.match(html,/const cmCss=cmAsset\('lib\/codemirror\.css'\)/);
 const pins=require('../src/vendor-library-lock.json').assets;
 for(const p of ['lib/codemirror.js','lib/codemirror.css','mode/javascript/javascript.js','mode/yaml/yaml.js','mode/markdown/markdown.js'])
  assert.ok(pins.some(x=>x.path==='codemirror/'+p),p);
 assert.ok(pins.some(x=>x.path==='codemirror/LICENSE.txt'));
 assert.match(html,/vendorAssets\?cmFiles\.map/);
 assert.match(html,/id="libraryValidate"/);
 assert.match(html,/case 'libraryValidate':\{/);
});
test('CodeMirror editor is read-only until Edit, then requires validation for Save Local',()=>{
 const v=view();assert.equal(v.cm.options.readOnly,true);assert.equal(v.cm.value,v.res.content);assert.equal(v.cm.options.mode.name,'javascript');
 v.$('libraryEdit').click();assert.equal(v.cm.options.readOnly,false);
 v.cm.setValue('{"id":"BA", "workflows":[]}');assert.equal(v.$('librarySave').disabled,true);
 v.$('libraryValidate').click();const req=v.messages.at(-1);assert.equal(req.type,'libraryValidate');
 v.recv({type:'libraryValidation',success:true,requestId:req.body.requestId,path:req.body.path,scope:req.body.scope,diagnostics:[]});
 assert.equal(v.$('librarySave').disabled,false);
 v.cm.setValue('{"id":"BA"');assert.equal(v.$('librarySave').disabled,true);
 v.$('libraryValidate').click();const req2=v.messages.at(-1);
 v.recv({type:'libraryValidation',success:false,requestId:req2.body.requestId,path:req2.body.path,scope:req2.body.scope,diagnostics:[{severity:'error',message:'Invalid JSON',line:1}]});
 assert.equal(v.$('librarySave').disabled,true);assert.match(v.$('libraryDiagnostics').textContent,/Invalid JSON/);
 v.$('libraryCancel').click();assert.equal(v.cm.value,v.res.content);assert.equal(v.cm.options.readOnly,true);
});
test('trusted validation rejects malformed JSON, JavaScript, common YAML issues and preserves markdown checks',()=>{
 assert.throws(()=>library.validateResource('ai-harness/agents/business-analyst.json','{"id":'),/Invalid JSON/);
 assert.throws(()=>library.validateResource('ai-harness/agents/business-analyst.json','{"workflows":[]}'),/requires a non-empty id/);
 assert.equal(library.validateResource('ai-harness/agents/business-analyst.json','{"id":"BA"}').valid,true);
 assert.throws(()=>library.validateResource('tech-stacks/react/scaffold/server/index.mjs','const =;'),/JavaScript syntax/);
 assert.equal(library.validateResource('tech-stacks/react/scaffold/server/index.mjs','export const foo = 1;').valid,true);
 assert.throws(()=>library.validateResource('sdlc/processes/test.yaml','test:\n\ttask: true'),/tabs/);
 assert.throws(()=>library.validateResource('sdlc/processes/test.yml','test: true\ntest: false'),/Duplicate YAML/);
 assert.equal(library.validateResource('roles/software-developer/SKILL.md','# Developer\nPreserve locked tests.').valid,true);
 assert.throws(()=>library.validateResource('roles/software-developer/SKILL.md','# Short'),/too short/);
});
