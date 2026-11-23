'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const js=read('media/ba-automatic-ui.js');
const css=read('media/start.css');

test('Business Requirements sections load collapsed with no draft rows',()=>{
 for(const id of ['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira']){
  assert.match(html,new RegExp('<details id="'+id+'" class="ba-auto-artifact">'));
  assert.doesNotMatch(html,new RegExp('<details id="'+id+'"[^>]*\\sopen(?:\\s|>)'));
 }
 assert.match(html,/id="baAutoContinueRow"[^>]*hidden/);
 assert.match(html,/id="baAutoContinue"[^>]*aria-controls="baAutoSource"/);
 assert.match(css,/#discoveryView\.ba-automatic-view \.ba-auto-artifact\[hidden\]/);
 assert.match(js,/revealedSection='';completionSeen\.clear\(\)/);
 assert.match(js,/target\.hidden=false;target\.open=true/);
});

test('Jira DataTable controls exist only inside expanded section, not heading',()=>{
 const start=html.indexOf('<summary class="ba-auto-jira-heading">');
 const end=html.indexOf('</summary>',start);
 const toolbar=html.slice(end,html.indexOf('id="baAutoJiraBlockers"',end));
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(html.slice(start,end),/baAutoJiraView|baAutoJiraTabs/);
 assert.match(toolbar,/class="ba-auto-jira-toolbar"/);
 assert.match(toolbar,/id="baAutoJiraView"/);
 assert.match(toolbar,/id="baAutoJiraTabs"/);
 for(const id of ['baAutoJiraView','baAutoJiraTabs','baAutoJiraBadge'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
});

test('visibility follows verified completion and allows explicit unfinished access',()=>{
 const ids=['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira'];
 const labels=Object.fromEntries(ids.map(id=>[id,id]));
 const nodes=Object.fromEntries([...ids,'baAutoHistory'].map(id=>[id,{hidden:false,open:false}]));
 for(const id of ids)nodes[id+'Badge']={dataset:{state:'draft'}};
 nodes.baAutoContinueRow={hidden:true};
 nodes.baAutoContinueLabel={textContent:''};
 nodes.baAutoContinue={dataset:{},setAttribute(k,v){this[k]=v},textContent:''};
 const context={
  sectionIds:ids,sectionLabels:labels,completionSeen:new Map(),revealedSection:'',
  get:id=>nodes[id],source:()=>context.currentSource,busy:()=>false,
  currentSource:null,brState:{completedCycles:[],synced:{}},Object
 };
 const begin=js.indexOf(' function manageSectionVisibility(){');
 const end=js.indexOf('\n function placeSkill(){',begin);
 assert.ok(begin>=0&&end>begin);
 vm.createContext(context);
 vm.runInContext(js.slice(begin,end),context);
 const sync=()=>vm.runInContext('manageSectionVisibility()',context);
 sync();
 for(const id of ids){assert.equal(nodes[id].hidden,true);assert.equal(nodes[id].open,false)}
 assert.equal(nodes.baAutoContinueRow.hidden,false);
 assert.equal(nodes.baAutoContinue.dataset.section,'baAutoSource');
 assert.equal(nodes.baAutoHistory.hidden,true);

 context.currentSource={digest:'source'};
 for(const id of ids)nodes[id+'Badge'].dataset.state='ready';
 sync();
 for(const id of ids){assert.equal(nodes[id].hidden,false);assert.equal(nodes[id].open,false)}
 assert.equal(nodes.baAutoContinueRow.hidden,true);

 nodes.baAutoDiscoveryBadge.dataset.state='draft';
 sync();
 assert.equal(nodes.baAutoDiscovery.hidden,true);
 context.revealedSection='baAutoDiscovery';
 nodes.baAutoDiscovery.open=true;
 sync();
 assert.equal(nodes.baAutoDiscovery.hidden,false);
 assert.equal(nodes.baAutoDiscovery.open,true);
 nodes.baAutoDiscoveryBadge.dataset.state='ready';
 sync();
 assert.equal(nodes.baAutoDiscovery.open,false);
 context.brState.completedCycles=[{id:'CYCLE-1'}];
 sync();
 assert.equal(nodes.baAutoHistory.hidden,false);
});
