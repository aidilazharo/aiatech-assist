'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const checks=require('../src/agent-harness-checks');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/library-studio.js'),'utf8');
class El{
 constructor(){this.style={};this.attributes={};this.value='';this.textContent='';this.disabled=false;this.readOnly=false;this.checked=false;this.children=[];this.options=[];this.selectedIndex=0;this.listeners={};const names=new Set();this.classList={contains:x=>names.has(x),add:x=>names.add(x),remove:x=>names.delete(x),toggle:(x,f)=>{let v=f===undefined?!names.has(x):f;v?names.add(x):names.delete(x);return v}};}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
 fire(k){(this.listeners[k]||[]).forEach(fn=>fn({target:this}))}
 click(){this.fire('click')}
 append(...x){this.children.push(...x);this.options.push(...x)}
 replaceChildren(...x){this.children=[...x];this.options=[...x]}
 setAttribute(k,v){this.attributes[k]=String(v)}
 focus(){}
}
function view(){
 const elements=new Map(),events={},messages=[];const get=id=>{if(!elements.has(id))elements.set(id,new El());return elements.get(id)};
 get('libraryCategory').value='All';get('libraryScope').value='user';get('libraryScope').options=[{text:'User',value:'user'}];
 vm.runInNewContext(ui,{document:{getElementById:get,createElement:()=>new El(),querySelector:()=>null},window:{addEventListener:(event,fn)=>events[event]=fn},send:(type,body)=>messages.push({type,body})},{timeout:1500});
 const recv=msg=>events.message({data:msg});
 recv({type:'libraryResource',value:{path:'ai-harness/agents/git-agent.json',category:'AI Harness',source:'shared',scope:'user',content:'{"id":"git-agent"}',shared:'{"id":"git-agent"}',hasLocal:false,hash:'test'}});
 return {get,recv,messages};
}
test('single catalog button and harness test panel is immediately below editor and above preview notice',()=>{
 assert.doesNotMatch(html,/id="libraryRefresh"/);
 assert.match(html,/id="libraryCheckUpdates"/);
 assert.match(html,/id="libraryEditor"[\s\S]*id="libraryHarnessTests"[\s\S]*id="libraryEditNotice"/);
 assert.match(html,/id="libraryResourceTitle"[\s\S]*id="libraryAgentDashboard"[\s\S]*id="libraryHarnessProgress"[\s\S]*id="libraryHarnessSelector"/);
 assert.doesNotMatch(html,/id="libraryHarnessRingValue"/);
 assert.match(html,/case 'libraryHarnessChecks':\{/);
});
test('configuration checks start automatically; no visible Run Checks button or check summary',()=>{
 const v=view();const m=v.messages.find(x=>x.type==='libraryHarnessChecks');
 assert.ok(m);assert.equal(m.body.path,'ai-harness/agents/git-agent.json');
 assert.match(html,/id="libraryHarnessProgress"/);
 assert.doesNotMatch(html,/id="libraryRunHarnessChecks"|Check evidence|Run Checks to validate this agent/);
 v.recv({type:'libraryHarnessResult',path:m.body.path,scope:'user',requestId:m.body.requestId,report:{checks:[{label:'Context',status:'pass',detail:'Role skill resolved.'},{label:'Tools',status:'pass',detail:'Permissions declared.'},{label:'Loop',status:'not-tested',detail:'Trace needed.'},{label:'Governance',status:'pass',detail:'Approvals declared.'}]}});
 assert.equal(v.get('libraryHarnessSteps').children.length,4);
 assert.equal(v.get('libraryHarnessSteps').children.filter(x=>x.className.includes('partial')).length,3);
 assert.equal(v.get('libraryHarnessProgress').attributes['aria-valuenow'],'75');
});
test('configuration test panel appears only for agents, workflows, and harness manifest',()=>{
 const v=view();
 assert.equal(v.get('libraryHarnessTests').classList.contains('hidden'),false);
 for(const path of ['roles/software-developer/SKILL.md','ai-harness/skills/dev-tdd-repair/SKILL.md','ai-harness/skills/dev-tdd-repair/skill.json','tech-stacks/react/stack.json','shared/design-systems/aia-qi/AI-GUIDANCE.md']){
  v.recv({type:'libraryResource',value:{path,category:'AI Skills',source:'shared',scope:'user',content:'example',shared:'example',hasLocal:false,hash:'test'}});
  assert.equal(v.get('libraryHarnessTests').classList.contains('hidden'),true,path);
  assert.equal(v.get('libraryHarnessTests').classList.contains('hidden'),true,path);
 }
 for(const path of ['ai-harness/agents/business-analyst.json','ai-harness/workflows/developer-tdd.json','ai-harness/manifest.json']){
  v.recv({type:'libraryResource',value:{path,category:'AI Harness',source:'shared',scope:'user',content:'{}',shared:'{}',hasLocal:false,hash:'test'}});
  assert.equal(v.get('libraryHarnessTests').classList.contains('hidden'),false,path);
  assert.ok(v.messages.some(m=>m.type==='libraryHarnessChecks'&&m.body.path===path),path);
 }
});
test('four circular steps animate automatic checks and preserve fail/pending states',()=>{
 const v=view(),m=v.messages.find(x=>x.type==='libraryHarnessChecks');
 assert.equal(v.get('libraryHarnessProgress').classList.contains('is-running'),true);
 v.recv({type:'libraryHarnessResult',path:m.body.path,scope:'user',requestId:m.body.requestId,report:{checks:[
  {label:'Context',status:'pass',detail:'ok'},
  {label:'Tools',status:'fail',detail:'invalid'},
  {label:'Loop',status:'not-tested',detail:'trace required'},
  {label:'Governance',status:'pass',detail:'ok'}]}});
 assert.equal(v.get('libraryHarnessProgress').classList.contains('is-running'),false);
 assert.equal(v.get('libraryHarnessSteps').children.filter(x=>x.className.includes('partial')).length,2);
 assert.equal(v.get('libraryHarnessSteps').children.filter(x=>x.className.includes('fail')).length,1);
 assert.equal(v.get('libraryHarnessProgress').attributes['aria-valuenow'],'50');
});
test('missing harness configuration emits validation result and frontend does not count it as completed',async()=>fixture(async({dir})=>{
 await assert.rejects(()=>checks.run({root:dir,relative:'roles/business-analyst/SKILL.md',content:'# BA'}),/agent definitions/);
 await assert.rejects(()=>checks.run({root:dir,relative:'ai-harness/skills/dev-tdd-green/skill.json',content:'{}'}),/agent definitions/);
}));
async function fixture(fn){
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-harness-check-'));
 async function write(file,body){const f=path.join(dir,file);await fsp.mkdir(path.dirname(f),{recursive:true});await fsp.writeFile(f,typeof body==='string'?body:JSON.stringify(body));}
 try{
  await write('roles/software-developer/SKILL.md','# Developer\nValid agent guidance for approved work.\n');
  await write('ai-harness/agents/git-agent.json',{id:'git-agent'});
  await write('ai-harness/workflows/library-contribution.json',{id:'library-contribution',agent:'git-agent',steps:[{id:'approval',guard:'atgv-core',requiresEvidence:true,skills:[]}],execution:{runtime:'atgv-core',catalogScriptsAutoExecute:false,pinRunSnapshot:true}});
  await fn({dir,write});
 }finally{await fsp.rm(dir,{force:true,recursive:true});}
}
test('trusted agent checks detect missing role, unsafe Git permissions and no live-trace claims',async()=>fixture(async({dir})=>{
 const base={id:'git-agent',roleSkill:'roles/software-developer/SKILL.md',workflows:['library-contribution'],permissions:['read_catalog'],execution:'atgv-core-only',userApprovalRequiredFor:['create_branch','commit_file','create_pull_request'],forbidden:['force_push','direct_push_main','secrets_access']};
 let result=await checks.run({root:dir,relative:'ai-harness/agents/git-agent.json',content:JSON.stringify(base)});
 assert.equal(result.valid,true);assert.equal(result.checks.find(x=>x.label==='Loop').status,'not-tested');assert.match(result.note,/Static/);
 result=await checks.run({root:dir,relative:'ai-harness/agents/git-agent.json',content:JSON.stringify({...base,roleSkill:'roles/not-real/SKILL.md'})});
 assert.equal(result.checks.find(x=>x.label==='Context').status,'fail');
 result=await checks.run({root:dir,relative:'ai-harness/agents/git-agent.json',content:JSON.stringify({...base,forbidden:[]})});
 assert.equal(result.checks.find(x=>x.label==='Governance').status,'fail');
}));
test('trusted workflow checks identify missing specialist skills and unguarded execution',async()=>fixture(async({dir})=>{
 const base={id:'library-contribution',agent:'git-agent',steps:[{id:'approved',guard:'atgv-core',requiresEvidence:true,skills:[]}],execution:{runtime:'atgv-core',catalogScriptsAutoExecute:false,pinRunSnapshot:true}};
 let result=await checks.run({root:dir,relative:'ai-harness/workflows/library-contribution.json',content:JSON.stringify(base)});
 assert.equal(result.valid,true);
 result=await checks.run({root:dir,relative:'ai-harness/workflows/library-contribution.json',content:JSON.stringify({...base,steps:[{id:'approved',guard:'remote',requiresEvidence:false,skills:['missing-skill']}]})});
 assert.equal(result.checks.find(x=>x.label==='Tools').status,'fail');assert.equal(result.checks.find(x=>x.label==='Governance').status,'fail');
}));
