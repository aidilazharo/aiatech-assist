'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const css=read('media/atgv-mywork-ai.css');
const ui=read('media/atgv-mywork-ai.js');
const start=read('media/start.js');
const host=read('src/lib/runtime/extension-runtime.js');
const packageJson=JSON.parse(read('package.json'));

function fixture(){
  const handlers={},sent=[],timeouts=new Map(),calls=[];
  let id=0;
  const element=()=>({
    hidden:false,children:[],classList:{contains:()=>false},
    setAttribute(name,value){this[name]=value;},
    replaceChildren(...children){this.children=children;},
    append(child){this.children.push(child);},
    addEventListener(name,fn){this['on'+name]=fn;},
    scrollIntoView(){calls.push('scroll');},
    closest(){return {classList:{contains:()=>false}};}
  });
  const nodes=new Map();
  for(const key of ['atgvMyWorkAi','atgvMyWorkAiOrb','atgvMyWorkAiContent',
      'atgvMyWorkAiText','atgvMyWorkAiActions','atgvMyWorkAiTitle',
      'discoveryView','architectBootstrap','uxDesignWorkspace',
      'developerTaskDashboard','pmDailyCockpit','roleStepFlow'])nodes.set(key,element());
  nodes.get('atgvMyWorkAi').dataset={state:'idle'};
  const document={
    getElementById:key=>nodes.get(key)||null,
    createElement:()=>element()
  };
  const window={
    addEventListener:(name,fn)=>{handlers[name]=fn;}
  };
  const timers={
    setTimeout(fn,ms){const key=++id;timeouts.set(key,{fn,ms});return key;},
    clearTimeout(key){timeouts.delete(key);},
    fire(ms){const entry=[...timeouts].find(([,item])=>item.ms===ms);if(!entry)return false;
      timeouts.delete(entry[0]);entry[1].fn();return true;}
  };
  const navigate=x=>calls.push('navigate:'+x);
  const send=(name,payload)=>sent.push({name,payload});
  vm.runInNewContext(ui,{window,document,send,navigate,
    setTimeout:timers.setTimeout.bind(timers),clearTimeout:timers.clearTimeout.bind(timers)});
  const update=window.ATGVMyWorkAI.update;
  const reply=msg=>handlers.message({data:msg});
  return {nodes,send,update,reply,sent,timers,calls};
}
const sample=(roleId='business-analyst')=>({
  projectId:'project-one',roleId,roleName:'Business Analyst',progress:'35%',next:'Complete 12 discovery questions',
  tasks:[{title:'Discovery',done:false}],requirements:[{id:'BR-01',status:'draft'}],
  assigned:[{key:'TC-7',status:'In Progress'}]
});
test('panel is shared by all My Work roles and starts with only the centered orb',()=>{
  const begin=html.indexOf('<main id="workView"');
  const panel=html.indexOf('id="atgvMyWorkAi"',begin);
  const roles=html.indexOf('id="baMyWorkDashboard"',begin);
  assert.ok(begin>=0&&panel>begin&&roles>panel);
  assert.equal(html.match(/id="atgvMyWorkAi"/g)?.length,1);
  const section=html.slice(panel,roles);
  assert.match(section,/id="atgvMyWorkAiContent" class="atgv-mywork-ai-content" hidden/);
  assert.doesNotMatch(section,/<textarea|<input|contenteditable/);
  assert.match(css,/flex-direction:column;justify-content:center;align-items:center/);
  assert.match(css,/background:#000!important;color:#fff!important/);
  assert.match(css,/border:0!important/);
  assert.match(css,/\.atgv-mywork-ai-content\[hidden\]/);
});
test('orb runs blue idle, blue-green thinking, green success and disappears',()=>{
  for(const name of ['idle','thinking','success','complete'])assert.match(ui,new RegExp(name));
  for(const name of ['thinking','success','complete'])assert.match(css,new RegExp('data-state="'+name+'"'));
  assert.match(css,/atgv-orb-success 1\.25s/);
  assert.match(css,/data-state="complete"\] \.atgv-mywork-ai-visual\{display:none\}/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
test('buttons and guidance are generated only after a scoped response',()=>{
  const f=fixture();
  f.update(sample());
  assert.equal(f.nodes.get('atgvMyWorkAi').dataset.state,'thinking');
  assert.equal(f.nodes.get('atgvMyWorkAiContent').hidden,true);
  assert.equal(f.nodes.get('atgvMyWorkAiActions').children.length,0);
  assert.equal(f.timers.fire(300),true);
  assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].name,'roleAiReview');
  assert.equal(f.sent[0].payload.roleId,'business-analyst');
  f.reply({type:'roleAiSuggestion',projectId:'project-one',roleId:'business-analyst',
    requestId:1,message:'Complete the 12 discovery questions.',actionLabel:'Open Business Requirements',error:false});
  assert.equal(f.nodes.get('atgvMyWorkAiContent').hidden,false);
  assert.equal(f.nodes.get('atgvMyWorkAiText').textContent,'Complete the 12 discovery questions.');
  assert.equal(f.nodes.get('atgvMyWorkAiActions').children.length,2);
  assert.equal(f.nodes.get('atgvMyWorkAi').dataset.state,'success');
  assert.equal(f.timers.fire(1250),true);
  assert.equal(f.nodes.get('atgvMyWorkAi').dataset.state,'complete');
  f.nodes.get('atgvMyWorkAiActions').children[0].onclick();
  assert.ok(f.calls.includes('scroll'));
});
test('all roles have grounded suggestions when no provider response arrives',()=>{
  for(const roleId of ['business-analyst','solution-architect','ux-designer',
    'software-developer','project-manager','qa-engineer']){
    const f=fixture();
    const data=sample(roleId);
    data.roleName=roleId;
    f.update(data);
    f.timers.fire(300);
    assert.equal(f.timers.fire(18000),true);
    assert.equal(f.nodes.get('atgvMyWorkAiContent').hidden,false,roleId);
    assert.ok(f.nodes.get('atgvMyWorkAiText').textContent.length>12,roleId);
    assert.equal(f.nodes.get('atgvMyWorkAiActions').children.length,2,roleId);
  }
});
test('stale responses cannot overwrite next role, Review again re-analyzes',()=>{
  const f=fixture();
  f.update(sample('business-analyst'));
  f.update(sample('ux-designer'));
  f.reply({type:'roleAiSuggestion',projectId:'project-one',roleId:'business-analyst',
    requestId:1,message:'Ignore this stale suggestion'});
  assert.equal(f.nodes.get('atgvMyWorkAiContent').hidden,true);
  f.reply({type:'roleAiSuggestion',projectId:'project-one',roleId:'ux-designer',
    requestId:2,message:'Review the design workflow',error:false});
  const buttons=f.nodes.get('atgvMyWorkAiActions').children;
  assert.equal(buttons.length,2);
  buttons[1].onclick();
  assert.equal(f.nodes.get('atgvMyWorkAiContent').hidden,true);
  assert.equal(f.nodes.get('atgvMyWorkAi').dataset.state,'thinking');
});
test('AI calls are read-only and scoped to visible role work',()=>{
  assert.match(start,/if\(view==='work'\|\|view==='discovery'\)window\.ATGVMyWorkAI\?\.update/);
  assert.match(host,/case 'roleAiReview'/);
  assert.match(host,/requireOpened\(\)/);
  assert.match(host,/activeAiTarget\(\)/);
  assert.match(host,/const groundedNext=/);
  assert.match(ui,/send\('roleAiReview'/);
  assert.doesNotMatch(ui,/send\('(?:brJiraSync|pmJiraSetAssignee|architectApproveStack|uxPublishFrontend|delete|publish)'/);
  assert.match(host,/The AI cannot invoke commands/);
  assert.equal(packageJson.version,'0.0.8');
  assert.equal(packageJson.atgvDisplayVersion,'0.0.8');
});
