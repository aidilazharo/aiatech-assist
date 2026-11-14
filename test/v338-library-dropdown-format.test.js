'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const script=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/library-studio.css'),'utf8');
class Element{
 constructor(){this.value='';this.textContent='';this.children=[];this.options=[];this.style={};this.listeners={};this.attrs={};this.disabled=false;this.readOnly=false;const names=new Set();this.classList={add:s=>names.add(s),remove:s=>names.delete(s),contains:s=>names.has(s),toggle:(s,v)=>{v=v===undefined?!names.has(s):!!v;v?names.add(s):names.delete(s);return v;}};}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]||null;}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f)}
 click(){for(const f of this.listeners.click||[])f({target:this});}
 append(...els){this.children.push(...els);this.options.push(...els)}
 replaceChildren(...els){this.children=[...els];this.options=[...els]}
 focus(){}remove(){}
}
function load(){
 const elements=new Map(),events={},calls=[];
 const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 get('libraryCategory').value='All';get('libraryScope').value='user';get('libraryScope').options=[{text:'My local skills',value:'user'}];
 get('libraryImageModel').value='configured';get('libraryImagePrompt').value='Create a blue circle';
 get('libraryRelationPanel').classList.add('hidden');
 vm.runInNewContext(script,{window:{addEventListener:(event,handler)=>events[event]=handler},document:{getElementById:get,createElement:()=>new Element(),querySelectorAll:()=>[]},send:(type,body)=>calls.push({type,body})},{timeout:3000});
 return {get,calls,recv:message=>events.message({data:message})};
}
test('related files are in one accessible select; obsolete tablist and visible heading removed',()=>{
 assert.match(host,/id="libraryRelatedTabs" class="library-related-files hidden"/);
 assert.doesNotMatch(host,/id="libraryRelatedTabs"[^>]*role="tablist"/);
 assert.doesNotMatch(host,/<label[^>]+>Agent \/ Harness resource<\/label>/);
 assert.match(script,/select\.id='libraryRelatedFile'/);
 assert.match(css,/\.library-related-files select\{display:block;width:100%/);
 assert.match(script,/lineWrapping:true/);
});
test('dropdown opens only the selected existing catalog path and protects unsaved edits',()=>{
 const v=load(),rootPath='ai-harness/agents/business-analyst.json',next='roles/business-analyst/SKILL.md';
 v.recv({type:'libraryResource',value:{path:rootPath,category:'AI Harness',content:'{"id":"business-analyst"}',shared:'{"id":"business-analyst"}',hash:'x',scope:'user',source:'shared'},relatedRoot:rootPath,relatedFiles:[{path:rootPath,type:'agent'},{path:next,type:'role'}]});
 const selector=v.get('libraryRelatedTabs').children[0];
 assert.equal(selector.id,'libraryRelatedFile');assert.equal(selector.options.length,2);
 selector.value=next;selector.listeners.change[0]();
 assert.equal(v.calls.at(-1).type,'libraryRead');
 assert.equal(v.calls.at(-1).body.path,next);
 assert.equal(v.calls.at(-1).body.scope,'user');
 assert.equal(v.calls.at(-1).body.rootPath,rootPath);
});
test('Format JSON operates only during Edit and does not save without validation',()=>{
 const v=load(),raw='{"id":"business-analyst","workflows":["ba-requirements"]}';
 v.recv({type:'libraryResource',value:{path:'ai-harness/agents/business-analyst.json',category:'AI Harness',content:raw,shared:raw,hash:'x',scope:'user',source:'shared'}});
 assert.equal(v.get('libraryFormat').classList.contains('hidden'),true);
 v.get('libraryEdit').click();
 assert.equal(v.get('libraryFormat').classList.contains('hidden'),false);
 v.get('libraryFormat').click();
 assert.match(v.get('libraryEditor').value,/\n  "workflows": \[/);
 assert.equal(v.get('librarySave').disabled,true,'Formatting must require validation before save');
 assert.equal(v.calls.some(x=>x.type==='librarySave'),false);
});
