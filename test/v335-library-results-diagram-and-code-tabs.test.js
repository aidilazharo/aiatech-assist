'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const image=require('../src/agent-image-test');
const base=path.join(__dirname,'..'),host=fs.readFileSync(path.join(base,'test/generated/extension-source.txt'),'utf8'),js=fs.readFileSync(path.join(base,'media/library-studio.js'),'utf8'),css=fs.readFileSync(path.join(base,'media/library-studio.css'),'utf8');

test('Resources button is icon-only, image code tabs are before verdict on left; right-hand harness contains no code runner',()=>{
 const left=host.slice(host.indexOf('id="libraryImageResultsPanel"'),host.indexOf('</section>',host.indexOf('id="libraryImageResultsPanel"')));
 const right=host.slice(host.indexOf('id="libraryHarnessTests"'),host.indexOf('id="libraryEditNotice"',host.indexOf('id="libraryHarnessTests"')));
 assert.doesNotMatch(host,/id="libraryResultsBrowse"|id="libraryImageRefresh"/);
 assert.match(host,/id="libraryBrowseResources"[^>]*aria-label="Browse Resources"/);
 for(const language of ['svg','typescript','csharp','java'])assert.match(left,new RegExp('data-code-language="'+language+'"'));
 assert.ok(left.indexOf('id="libraryImageCodeMode"')<left.indexOf('id="libraryImageVerdict"'));
 assert.doesNotMatch(right,/id="libraryImageCodeMode"|id="libraryImageReplay"/);
 assert.match(css,/\.library-image-preview:empty\{display:none\}/);
 assert.match(css,/\.library-image-preview\{[^}]*background:transparent/);
 assert.match(host,/id="libraryRelationships"/);
 assert.match(js,/function showRelationDiagram\(\)/);
 assert.doesNotMatch(js,/eval\(|new Function\(/);
});

test('Image-only default is transparent while an explicit background request remains reproducible',()=>{
 assert.match(host,/id="libraryImageDifficulty"/);
 assert.equal(image.referenceCase('blue-circle').background,'none');
 assert.match(image.referencePrompt(image.referenceCase('blue-circle')),/transparent background/);
 const spec=image.parseSpec('{"shape":"circle","color":"blue"}');
 assert.equal(spec.background,'none');
 const svg=image.svgFromSpec(spec);
 assert.doesNotMatch(svg,/<rect width="256" height="256"/);
 assert.match(svg,/<circle cx="128"/);
 assert.equal(image.svgFromSpec(spec),svg);
 const white=image.svgFromSpec(image.parseSpec('{"shape":"circle","color":"blue","background":"white"}'));
 assert.match(white,/<rect width="256" height="256" fill="#ffffff"/);
});

class E{
 constructor(){this.value='';this.textContent='';this.title='';this.disabled=false;this.readOnly=false;this.children=[];this.options=[];this.selectedIndex=0;this.style={};this.attributes={};this.listeners={};const values=new Set();this.classList={contains:x=>values.has(x),add:x=>values.add(x),remove:x=>values.delete(x),toggle:(x,v)=>{v=v===undefined?!values.has(x):!!v;v?values.add(x):values.delete(x);return v;}};}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f)}click(){for(const f of this.listeners.click||[])f({target:this});}
 append(...children){this.children.push(...children);this.options.push(...children)}replaceChildren(...children){this.children=[...children];this.options=[...children]}
 setAttribute(k,v){this.attributes[k]=v}getAttribute(k){return this.attributes[k]??null}focus(){}remove(){}
}
function load(){
 const els=new Map(),events={},calls=[],get=id=>{if(!els.has(id))els.set(id,new E());return els.get(id)};
 get('libraryCategory').value='All';get('libraryScope').value='user';get('libraryScope').options=[{text:'User',value:'user'}];
 get('libraryImageModel').value='configured';get('libraryImagePrompt').value='Create a blue circle with a transparent background.';
 get('libraryRelationPanel').classList.add('hidden');
 const tabs=['svg','typescript','csharp','java'].map(lang=>{const node=new E();node.setAttribute('data-code-language',lang);return node;});
 vm.runInNewContext(js,{window:{addEventListener:(k,f)=>events[k]=f},document:{getElementById:get,createElement:()=>new E(),querySelectorAll:()=>tabs},send:(type,body)=>calls.push({type,body}),encodeURIComponent},{timeout:2000});
 return {get,calls,tabs,recv:x=>events.message({data:x})};
}
test('Relationship diagram displays actual linked files and opens selected path through trusted libraryRead',()=>{
 const v=load(),path='ai-harness/agents/software-developer.json';
 const relatedFiles=[
  {path,label:'Agent · software-developer.json',type:'agent'},
  {path:'roles/software-developer/SKILL.md',label:'Role · SKILL.md',type:'role'},
  {path:'ai-harness/workflows/developer-tdd.json',label:'Workflow · developer-tdd',type:'workflow'},
  {path:'ai-harness/skills/dev-tdd-red/SKILL.md',label:'AI · dev-tdd-red',type:'skill'},
  {path:'ai-harness/policies/guardrails.json',label:'Guardrails',type:'policy'}
 ];
 v.recv({type:'libraryResource',value:{path,category:'AI Harness',content:'{"id":"software-developer"}',shared:'{"id":"software-developer"}',hash:'x',scope:'user',source:'shared'},relatedRoot:path,relatedFiles});
 assert.equal(v.get('libraryRelationships').classList.contains('hidden'),false);
 v.get('libraryRelationships').click();
 assert.equal(v.get('libraryRelationPanel').classList.contains('hidden'),false);
 assert.equal(v.get('libraryRelationships').getAttribute('aria-expanded'),'true');
 const world=v.get('libraryRelationGraph').children.find(x=>x.className==='library-relation-world');
 assert.ok(world,'Interactive graph should be rendered');
 const nodes=world.children.filter(x=>String(x.className).includes('library-relation-canvas-node'));
 assert.equal(nodes.length,5);
 const skillCard=nodes.find(x=>x.title==='Open in CodeMirror: ai-harness/skills/dev-tdd-red/SKILL.md');
 assert.ok(skillCard);
 const oldTransform=world.style.transform;
 v.get('libraryRelationZoomIn').click();
 assert.notEqual(world.style.transform,oldTransform,'Zoom-in must change the viewport transform');
 v.get('libraryRelationZoomOut').click();
 v.get('libraryRelationFit').click();
 assert.match(v.get('libraryRelationZoomValue').textContent,/\d+%/);
 const before=skillCard.style.left;
 skillCard.listeners.pointerdown[0]({clientX:100,clientY:100,button:0,stopPropagation(){}});
 v.get('libraryRelationGraph').listeners.pointermove[0]({clientX:140,clientY:100});
 v.get('libraryRelationGraph').listeners.pointerup[0]({});
 assert.notEqual(skillCard.style.left,before,'Moving a node changes its position');
 skillCard.click(); // The pointer drag must not accidentally open a file.
 assert.notEqual(v.calls.at(-1)?.type,'libraryRead');
 skillCard.click();
 assert.equal(v.calls.at(-1).type,'libraryRead');
 assert.equal(v.calls.at(-1).body.path,'ai-harness/skills/dev-tdd-red/SKILL.md');
 assert.equal(v.calls.at(-1).body.rootPath,path);
});


test('Resource titles are human-friendly while original paths remain in metadata',()=>{
 const v=load();
 const samples=[
  ['ai-harness/workflows/ba-requirements.json','Business Requirements Workflow'],
  ['ai-harness/agents/software-developer.json','Software Developer Agent'],
  ['roles/business-analyst/SKILL.md','Business Analyst Role Guidance'],
  ['ai-harness/skills/dev-tdd-plan/SKILL.md','Dev TDD Plan — AI Instructions']
 ];
 for(const [path,title] of samples){
  v.recv({type:'libraryResource',value:{path,category:'AI Harness',content:'{}',shared:'{}',hash:'x',scope:'user',source:'shared'},relatedFiles:[]});
  assert.equal(v.get('libraryResourceTitle').textContent,title);
  assert.ok(v.get('libraryResourceMeta').textContent.includes(path));
 }
});
