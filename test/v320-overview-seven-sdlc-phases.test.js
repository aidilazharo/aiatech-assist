'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const phases=require('../media/overview-sdlc-phases');
const source=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const webview=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('v320: seven distinct SDLC phases exactly once with known project roles',()=>{
 assert.deepEqual(phases.PHASES.map(x=>x.label),['Planning','Requirements','Design','Development','Testing','Deployment','Maintenance']);
 const roles=phases.PHASES.flatMap(x=>x.roles);
 assert.equal(roles.length,new Set(roles).size,'roles must not be double-counted');
 for(const role of require('../src/sdlc-work').ROLES) assert.ok(roles.includes(role.id),'core role has no phase: '+role.id);
});
test('v320: phase progress uses only verified local task flags, not invented approval or Jira status',()=>{
 const roles=[
  {id:'project-manager',tasks:[{id:'plan'},{id:'risks'}]},
  {id:'business-analyst',tasks:[{id:'source'},{id:'requirements'}]},
  {id:'ux-designer',tasks:[{id:'prototype'}]},
  {id:'software-developer',tasks:[{id:'code'}]}
 ];
 const out=phases.aggregate(roles,{'project-manager':{plan:true,risks:'true'},'business-analyst':{source:true,requirements:true},'ux-designer':{prototype:true},'software-developer':{code:false}});
 assert.equal(out.length,7);
 assert.deepEqual(out.slice(0,5).map(p=>[p.completed,p.total,p.percent,p.state]),[
  [1,2,50,'in-progress'],[2,2,100,'complete'],[1,1,100,'complete'],[0,1,0,'not-started'],[0,0,0,'untracked']
 ]);
 assert.ok(out.every(p=>Number.isFinite(p.percent)&&p.percent>=0&&p.percent<=100));
 assert.deepEqual(phases.aggregate(null,null).map(x=>x.state),Array(7).fill('untracked'));
});
test('v320: Overview renders circles immediately beneath title and loads helper before app',()=>{
 const title=source.indexOf('<h1>Overview</h1>');
 const circles=source.indexOf('id="overviewPhaseCircles"');
 const summary=source.indexOf('id="overviewProgress"');
 assert.ok(title>=0&&circles>title&&summary>circles,'progress circles should appear under Overview title and before metric tiles');
 assert.match(source,/overviewSdlcJs=webview\.asWebviewUri/);
 assert.ok(source.indexOf('<script src="${overviewSdlcJs}"></script>')<source.indexOf('<script src="${js}"></script>'));
 assert.match(webview,/renderOverviewSdlcPhases\(\);/);
 assert.match(css,/\.overview-phase-ring/);
 assert.match(css,/@media\(max-width:520px\)/);
});
test('v320: webview update replaces all seven circles and exposes accessible live progress values',()=>{
 const from=webview.indexOf('function renderOverviewSdlcPhases(){');
 const to=webview.indexOf('function renderOverviewRoles(',from);
 assert.ok(from>0&&to>from);
 class Node {
  constructor(tag){this.tag=tag;this.children=[];this.style={setProperty:(key,value)=>{this.style[key]=value;}};this.attributes={};this.dataset={};this.textContent='';}
  setAttribute(key,value){this.attributes[key]=value;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
 }
 const elements={overviewPhaseCircles:new Node('div'),overviewPhaseSummary:new Node('span')};
 const context={document:{createElement:tag=>new Node(tag)},$:(id)=>elements[id],globalThis:{atgvOverviewSdlcPhases:phases},roleData:{roles:[{id:'business-analyst',tasks:[{id:'discovery'},{id:'review'}]}],progress:{'business-analyst':{discovery:true}}}};
 vm.createContext(context);vm.runInContext(webview.slice(from,to),context);
 context.renderOverviewSdlcPhases();
 assert.equal(elements.overviewPhaseCircles.children.length,7);
 assert.equal(elements.overviewPhaseSummary.textContent,'1 / 2 local tasks complete');
 const req=elements.overviewPhaseCircles.children[1];
 assert.equal(req.children[0].attributes['aria-valuenow'],'50');
 assert.equal(req.children[0].attributes['aria-valuetext'],'1 of 2 local tasks complete');
 assert.equal(req.children[0].style['--phase-percent'],'50%');
 context.roleData.progress['business-analyst'].review=true;
 context.renderOverviewSdlcPhases();
 assert.equal(elements.overviewPhaseCircles.children.length,7,'must replace old DOM instead of duplicating');
 assert.equal(elements.overviewPhaseCircles.children[1].dataset.state,'complete');
 assert.equal(elements.overviewPhaseSummary.textContent,'2 / 2 local tasks complete');
});
test('v320: TDD UI runner remains stack-selected and validates npm dependencies before RED/GREEN',()=>{
 const pipeline=fs.readFileSync(path.join(root,'src/developer-br-pipeline.js'),'utf8');
 const tdd=fs.readFileSync(path.join(root,'src/developer-tdd.js'),'utf8');
 const installer=fs.readFileSync(path.join(root,'src/stack-dependency-helper.js'),'utf8');
 assert.match(pipeline,/await dependencies\.ensureForTarget\(worktreeReal,/);
 assert.match(tdd,/await pipeline\.attachDependencies\(worktree,original/);
 assert.match(installer,/--include=dev/);
 assert.match(tdd,/Match the EXISTING test runner and imports in the project/);
 assert.match(tdd,/@testing-library\/user-event does NOT export waitFor/);
});
