'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const fsp=require('node:fs/promises');
const image=require('../src/agent-image-test');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/library-studio.css'),'utf8');

test('catalog update button has exactly one refresh icon with a busy animation and reduced-motion support',()=>{
 assert.match(html,/id="libraryCheckUpdates"[^>]*><svg class="library-sync-icon"[^>]*aria-hidden="true"/);
 assert.match(css,/#libraryView #libraryCheckUpdates\.is-syncing \.library-sync-icon/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(html,/id="libraryRefresh"/);
});

test('image-only model JSON produces reproducible, sanitized SVG; rejects injected code and shapes',()=>{
 const spec=image.parseSpec('{"shape":"circle","color":"blue","background":"white"}');
 assert.deepEqual(spec,{shape:'circle',color:'#2563eb',background:'#ffffff'});
 const svg=image.svgFromSpec(spec);
 assert.match(svg,/<circle cx="128" cy="128" r="73" fill="#2563eb"\/>/);
 assert.equal(svg,image.svgFromSpec(spec));
 assert.doesNotMatch(svg,/<script|javascript:/);
 assert.throws(()=>image.parseSpec('{"shape":"<script>","color":"blue"}'),/unsupported shape/);
 assert.throws(()=>image.parseSpec(JSON.stringify({shape:'circle',color:'red\" onload=\"alert(1)'})),/unsupported color/);
 assert.throws(()=>image.parseSpec('```javascript\nalert(1)\n```'),/valid JSON/);
});

test('image results persist the actual model, exact SVG, prompt, and separate human verdicts',async()=>{
 const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-image-v330-'));
 try{
  const spec=image.parseSpec('{"shape":"circle","color":"red","background":"white"}');
  const opts={prompt:'A red circle',agentPath:'ai-harness/agents/git-agent.json',spec,startedAt:'2026-11-14T00:00:00Z',durationMs:123};
  const one=image.makeRecord({...opts,model:'Model A',target:{kind:'vscode',vendor:'provider-A'}});
  const two=image.makeRecord({...opts,model:'Model B',target:{kind:'vscode',vendor:'provider-B'}});
  assert.notEqual(one.id,two.id);assert.equal(one.svg,two.svg);
  await image.record(temp,one);await image.record(temp,two);
  let saved=await image.history(temp);assert.deepEqual(saved.map(x=>x.model),['Model B','Model A']);
  assert.ok(saved.every(x=>x.verdict==='pending'&&x.svg&&x.prompt));
  const judged=await image.verdict(temp,one.id,'pass');assert.equal(judged.verdict,'pass');
  saved=await image.history(temp);assert.equal(saved.find(x=>x.id===two.id).verdict,'pending');
  assert.equal(image.traceChecks(judged)[0].status,'pass');
  assert.equal(image.traceChecks(two)[0].status,'not-tested');
  await assert.rejects(image.verdict(temp,two.id,'unknown'),/Invalid image verdict/);
 }finally{await fsp.rm(temp,{recursive:true,force:true});}
});

class E{
 constructor(){this.value='';this.textContent='';this.disabled=false;this.readOnly=false;this.checked=false;this.children=[];this.options=[];this.selectedIndex=0;this.style={};this.attributes={};this.listeners={};const c=new Set();this.classList={contains:x=>c.has(x),add:x=>c.add(x),remove:x=>c.delete(x),toggle:(x,v)=>{v=v===undefined?!c.has(x):v;v?c.add(x):c.delete(x);return v}};}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f)}
 click(){(this.listeners.click||[]).forEach(f=>f({target:this}))}
 append(...xs){this.children.push(...xs);this.options.push(...xs)}
 replaceChildren(...xs){this.children=[...xs];this.options=[...xs]}
 setAttribute(k,v){this.attributes[k]=v}getAttribute(k){return this.attributes[k]??null}focus(){}remove(){}
}
function harnessView(){
 const el=new Map(),events={},calls=[];const get=id=>{if(!el.has(id))el.set(id,new E());return el.get(id)};
 get('libraryCategory').value='All';get('libraryScope').value='user';get('libraryScope').options=[{text:'User',value:'user'}];
 get('libraryImagePrompt').value='Create a blue circle with a transparent background.';
 get('libraryImageModel').value='configured';
 const tabs=['svg','typescript','csharp','java'].map(name=>{const el=new E();el.setAttribute('data-code-language',name);return el;});
 vm.runInNewContext(ui,{window:{addEventListener:(k,fn)=>events[k]=fn},document:{getElementById:get,createElement:()=>new E(),querySelector:()=>null,querySelectorAll:()=>tabs},send:(type,body)=>calls.push({type,body}),encodeURIComponent},{timeout:1500});
 const pathName='ai-harness/agents/git-agent.json';
 const recv=x=>events.message({data:x});
 recv({type:'libraryResource',value:{path:pathName,category:'AI Harness',content:'{"id":"git-agent"}',shared:'{"id":"git-agent"}',hash:'test',scope:'user',source:'shared'}});
 return {get,calls,recv,pathName,tabs};
}
test('agent result panel shows model and image source; browse icon opens Resources, model run records results',()=>{
 const v=harnessView();assert.equal(v.get('libraryLeftTitleLabel').textContent,'Result Panel');
 assert.equal(v.get('libraryBrowseResources').classList.contains('hidden'),false);
 v.recv({type:'libraryImageModels',models:[{id:'provider:model-a',label:'Model A'},{id:'provider:model-b',label:'Model B'}]});
 v.recv({type:'libraryImageChallenge',path:v.pathName,challenge:image.makeRandomChallenge('abcdefgh12345678','medium')});
 v.get('libraryImageModel').value='provider:model-b';
 v.get('libraryImageRun').click();const request=v.calls.at(-1);
 assert.equal(request.type,'libraryImageRun');assert.equal(request.body.modelChoice,'provider:model-b');
 assert.equal(v.get('libraryBrowseResources').disabled,true);
 const spec=image.parseSpec('{"shape":"circle","color":"blue","background":"white"}');
 const result=image.makeRecord({prompt:'Create a blue circle centered on a white background.',agentPath:v.pathName,model:'Model B',target:{kind:'vscode',vendor:'provider'},spec,startedAt:'2026-11-14T00:00:00Z',durationMs:101});
 v.recv({type:'libraryImageResult',path:v.pathName,requestId:request.body.requestId,result});
 assert.equal(v.get('libraryBrowseResources').disabled,false);
 assert.match(v.get('libraryImageCode').value,/<svg/);
 assert.match(v.get('libraryImageModelEvidence').textContent,/Model B/);
 v.get('libraryImagePass').click();assert.equal(v.calls.at(-1).type,'libraryImageVerdict');
 v.recv({type:'libraryImageVerdict',path:v.pathName,result:{...result,verdict:'pass'}});
 assert.equal(v.get('libraryImagePass').disabled,true);
 v.tabs[1].click();assert.equal(v.get('libraryImageReplay').disabled,true);assert.match(v.get('libraryImageCode').value,/writeFileSync/);
 v.tabs[2].click();assert.equal(v.get('libraryImageReplay').disabled,true);assert.match(v.get('libraryImageCode').value,/File.WriteAllText/);
 v.tabs[3].click();assert.equal(v.get('libraryImageReplay').disabled,true);assert.match(v.get('libraryImageCode').value,/Files.writeString/);
 v.tabs[0].click();assert.equal(v.get('libraryImageReplay').disabled,false);
 v.get('libraryBrowseResources').click();assert.equal(v.get('libraryLeftTitleLabel').textContent,'Resources');
});
