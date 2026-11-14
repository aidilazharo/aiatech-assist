'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/library-studio.css'),'utf8');
const extension=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
class Element{
 constructor(tag='div'){
  this.tagName=tag;this.listeners={};this.children=[];this.attributes={};this.textContent='';this.value='';this.disabled=false;this.readOnly=false;this.options=[];this.selectedIndex=0;
  const names=new Set();this.classList={contains:name=>names.has(name),add:name=>names.add(name),remove:name=>names.delete(name),toggle:(name,force)=>{const yes=force===undefined?!names.has(name):force;if(yes)names.add(name);else names.delete(name);return yes;}};
 }
 addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
 fire(type){for(const fn of this.listeners[type]||[])fn({type,target:this});}
 click(){this.fire('click');}
 focus(){this.focused=true;}
 setAttribute(name,value){this.attributes[name]=value;}
 append(...items){this.children.push(...items);if(this.tagName==='select')this.options.push(...items);}
 prepend(item){this.children.unshift(item);}
 replaceChildren(...items){this.children=[...items];if(this.tagName==='select')this.options=[...items];}
 remove(){this.removed=true;}
}
function webview(){
 const nodes=new Map(),events={},messages=[];
 const byId=id=>{if(!nodes.has(id))nodes.set(id,new Element(id==='libraryCategory'?'select':'div'));return nodes.get(id);};
 const doc={getElementById:byId,createElement:tag=>new Element(tag),querySelector:()=>null};
 const win={addEventListener:(type,fn)=>events[type]=fn};
 byId('libraryCategory').value='All';byId('libraryScope').value='user';
 byId('libraryScope').options=[{value:'user',text:'My local skills'},{value:'project',text:'Project override'}];
 vm.runInNewContext(js,{document:doc,window:win,send:(type,body)=>messages.push({type,body}),console},{timeout:1500});
 const receive=msg=>events.message({data:msg});
 receive({type:'libraryList',items:[{name:'SKILL.md',path:'roles/software-developer/SKILL.md',category:'AI Skills'}],total:1,categories:['AI Skills'],catalog:{version:'1.1.6'}});
 const row=byId('libraryItems').children[0];row.click();
 assert.equal(messages.at(-1).type,'libraryRead');
 const skill={path:'roles/software-developer/SKILL.md',category:'AI Skills',source:'shared',content:'# Shared instructions\n',shared:'# Shared instructions\n',hasLocal:false,updateAvailable:false,hash:'h1'};
 receive({type:'libraryResource',value:skill});
 return {nodes,byId,messages,receive,skill,window:win};
}
test('Library Studio resources panel is aligned with the editor and scrolls internally',()=>{
 assert.match(css,/\.library-studio-layout\{[^}]*align-items:stretch/);
 assert.match(css,/\.library-studio-list\{[^}]*display:flex;flex-direction:column/);
 assert.match(css,/\.library-studio-list #libraryItems\{[^}]*flex:1 1 0;[^}]*height:0;[^}]*overflow-y:auto/);
 assert.doesNotMatch(css,/max-height:66vh/);
});
test('Library Studio preview cannot edit or save, explicit Edit enables Save Local',()=>{
 const v=webview(),editor=v.byId('libraryEditor'),edit=v.byId('libraryEdit'),save=v.byId('librarySave');
 assert.equal(editor.disabled,false);
 assert.equal(editor.readOnly,true);
 assert.equal(v.window.atgvLibraryStudio.isDirty(),false);
 assert.equal(edit.classList.contains('hidden'),false);
 assert.equal(save.classList.contains('hidden'),true);
 // Readonly user typing has no effect, and no save is ever sent during preview.
 if(!editor.readOnly){editor.value+='Unexpected edit';editor.fire('input');}
 assert.equal(editor.value,v.skill.content);
 assert.equal(v.messages.filter(x=>x.type==='librarySave').length,0);
 edit.click();
 assert.equal(editor.readOnly,false);
 assert.equal(edit.classList.contains('hidden'),true);
 assert.equal(save.classList.contains('hidden'),false);
 assert.equal(save.disabled,true);
 assert.equal(v.byId('libraryCancel').textContent,'Cancel');
 editor.value+='# New guidance\n';editor.fire('input');
 assert.equal(v.window.atgvLibraryStudio.isDirty(),true);
 assert.equal(save.disabled,true);
 v.byId('libraryValidate').click();
 const req=v.messages.at(-1);assert.equal(req.type,'libraryValidate');
 v.receive({type:'libraryValidation',success:true,requestId:req.body.requestId,path:req.body.path,scope:req.body.scope,diagnostics:[]});
 assert.equal(save.disabled,false);
 save.click();
 assert.equal(v.messages.at(-1).type,'librarySave');
 assert.equal(v.messages.at(-1).body.content,'# Shared instructions\n# New guidance\n');
 assert.equal(editor.readOnly,true);
 v.receive({type:'libraryResource',value:{...v.skill,content:'# Shared instructions\n# New guidance\n',source:'user',hasLocal:true,hash:'h2'},notice:'Saved'});
 assert.equal(editor.readOnly,true);
 assert.equal(edit.classList.contains('hidden'),false);
 assert.equal(save.classList.contains('hidden'),true);
});
test('Cancel discards unsaved changes; Close clears preview without saving',()=>{
 const v=webview(),editor=v.byId('libraryEditor');
 v.byId('libraryEdit').click();editor.value='Unwanted changes';editor.fire('input');
 assert.equal(v.window.atgvLibraryStudio.isDirty(),true);
 v.byId('libraryCancel').click();
 assert.equal(editor.value,v.skill.content);
 assert.equal(editor.readOnly,true);
 assert.equal(v.window.atgvLibraryStudio.isDirty(),false);
 assert.equal(v.byId('libraryCancel').textContent,'Close');
 assert.equal(v.messages.filter(x=>x.type==='librarySave').length,0);
 v.byId('libraryCancel').click();
 assert.equal(editor.disabled,true);
 assert.equal(v.byId('libraryResourceTitle').textContent,'Select a resource');
 assert.equal(v.byId('libraryEdit').disabled,true);
});
test('Library Studio webview initializes as read-only and provides Edit/Save/Cancel controls',()=>{
 assert.match(extension,/id="libraryEdit" disabled>Edit<\/button>/);
 assert.match(extension,/id="librarySave" class="hidden" disabled>Save Local<\/button>/);
 assert.match(extension,/id="libraryCancel" class="secondary hidden" disabled>Close<\/button>/);
 assert.match(extension,/id="libraryEditor"[^>]*disabled readonly/);
});
