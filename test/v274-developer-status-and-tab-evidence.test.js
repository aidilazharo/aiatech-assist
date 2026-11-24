'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const architecture=require('../src/developer-br-architecture');
const slice=(start,end)=>{
 const a=ui.indexOf(start),b=ui.indexOf(end,a);
 assert.ok(a>=0&&b>a,'missing function boundary: '+start);
 return ui.slice(a,b);
};
class FakeNode{
 constructor(tag='div',text=''){this.tag=tag;this.textContent=String(text||'');this.children=[];this.className='';}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
}
function renderTab(tab){
 const panel=new FakeNode('div');
 const context={
  developerBrTab:tab,developerBrFiles:['src/main.jsx','server/index.mjs'],
  developerBrEvidence:[],
  developerBrArchitecture:{tables:[{name:'people',file:'server/index.mjs',columns:['id INTEGER','name TEXT']}],endpoints:[{method:'GET',path:'/api/people',file:'server/index.mjs'}]},
  document:{createElement:tag=>new FakeNode(tag)},
  textElement:(tag,text='',cls='')=>{const el=new FakeNode(tag,text);el.className=cls;return el;},
  $:id=>{assert.equal(id,'developerBrCategoryPanel');return panel;},
  developerBrArtifactGroups:[
   ['frontend','Frontend',p=>/src\//.test(p)],
   ['backend','API / Backend',p=>/server\//.test(p)],
   ['database','Database',p=>/db|schema/.test(p)],
   ['integration','Integration',p=>/integration/.test(p)]
  ]
 };
 vm.runInNewContext(slice('function renderDeveloperBrCategory(){','function renderDeveloperBrOutput(){')+'\nrenderDeveloperBrCategory();',context);
 function flatten(node){return [node.textContent,...node.children.flatMap(flatten)].join(' | ');}
 return flatten(panel);
}
test('Database tab shows schema but not API routes; backend shows routes but not schema',()=>{
 const database=renderTab('database'),backend=renderTab('backend');
 assert.match(database,/Database schema/);assert.match(database,/people/);
 assert.match(database,/server\/index\.mjs/);
 assert.doesNotMatch(database,/API endpoints|GET \/api\/people/);
 assert.match(backend,/API endpoints/);assert.match(backend,/GET \/api\/people/);
 assert.doesNotMatch(backend,/Database schema|id INTEGER/);
 for(const tab of ['frontend','integration']){
  const rendered=renderTab(tab);
  assert.doesNotMatch(rendered,/Database schema|API endpoints|GET \/api\/people/);
 }
});
test('two adjacent SQL template strings cannot merge people and tasks columns',()=>{
 const parsed=architecture.parseArchitecture([{
  path:'server/index.mjs',
  content:'db.exec(`CREATE TABLE IF NOT EXISTS people (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)`);\n'
   +'db.exec(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, completed INTEGER DEFAULT 0)`);'
   +'app.get("/api/people", list);'
 }]);
 assert.equal(parsed.tables.length,2);
 const people=parsed.tables.find(t=>t.name==='people'),tasks=parsed.tables.find(t=>t.name==='tasks');
 assert.ok(people&&tasks);
 assert.deepEqual(people.columns,['id INTEGER PRIMARY KEY AUTOINCREMENT','name TEXT NOT NULL']);
 assert.deepEqual(tasks.columns,['id INTEGER PRIMARY KEY AUTOINCREMENT','title TEXT NOT NULL','completed INTEGER DEFAULT 0']);
 assert.ok(parsed.endpoints.some(x=>x.path==='/api/people'));
});
test('DDL scanner handles nested SQL type parentheses without splitting in the middle',()=>{
 const parsed=architecture.parseArchitecture([{path:'db/schema.sql',content:'CREATE TABLE people (id INTEGER, title VARCHAR(255), amount DECIMAL(10, 2));'}]);
 assert.equal(parsed.tables.length,1);
 assert.deepEqual(parsed.tables[0].columns,['id INTEGER','title VARCHAR(255)','amount DECIMAL(10, 2)']);
});
test('only developer-role issue in actual In Progress status can change BR New to In Progress',()=>{
 const snippet=slice('function jiraIssueLinkedBr(item){','function renderRoleJiraIssues(items,incomplete=false){')+'\n'+slice('function developerBrStatusOf(br){','function renderDeveloperBrAssignment(){');
 const context={selectedRole:'software-developer',roleJiraLoaded:true,roleJiraProject:'p',activeId:'p',
  brState:{brs:[{id:'BR-007',status:'approved',approvedRevision:1,needsRefresh:false}]},
  roleJiraItems:[],developerAssignedMine:[]};
 const status=()=>vm.runInNewContext(snippet+'\ndeveloperBrStatusOf(brState.brs[0]);',context);
 assert.equal(status(),'new');
 context.developerAssignedMine=[{mine:true,brRoot:true,brId:'BR-007',summary:'BR-007: Manage people',status:'To Do'}];
 assert.equal(status(),'new');
 context.developerAssignedMine[0].status='In Progress';assert.equal(status(),'in-progress');
 context.selectedRole='ux-designer';assert.equal(status(),'new');
 context.selectedRole='software-developer';context.roleJiraLoaded=false;assert.equal(status(),'new');
 context.roleJiraLoaded=true;context.developerAssignedMine=[{mine:false,brRoot:true,brId:'BR-007',summary:'BR-007: Manage people'}];assert.equal(status(),'new');
 context.developerAssignedMine=[{mine:true,key:'TC-403',parentKey:'TC-402',summary:'Validate person names'}];
 context.brState.synced={'BR-007':{key:'TC-400'},'BR-007/story-1':{key:'TC-402'},'BR-007/story-1/subtask-1':{key:'TC-403'}};
 assert.equal(status(),'new');
 context.brState.synced={};assert.equal(status(),'new');
 context.developerAssignedMine=[{mine:true,brRoot:true,brId:'BR-008',summary:'BR-008: Other'}];assert.equal(status(),'new');
 context.developerAssignedMine=[{mine:true,brRoot:true,brId:'BR-007',summary:'BR-007: Manage people'}];
 context.brState.brs[0].approvedRevision=2;assert.equal(status(),'new');
 context.developerAssignedMine[0].status='In Progress';assert.equal(status(),'in-progress');
 context.brState.brs[0].status='cancelled';assert.equal(status(),'cancelled');
});
test('selection-free view retains BR selector, progress, count and disabled Start while hiding tabs',()=>{
 const snippet=html.slice(html.indexOf('id="developerBrWorkspace"'),html.indexOf('id="developerManualTickets"'));
 assert.match(snippet,/id="developerBrDetails" class="developer-br-details"/);
 assert.match(snippet,/id="developerBrWorkArea" class="developer-br-work-area hidden"/);
 assert.match(ui,/developerBrWorkArea'\)\.classList\.toggle\('hidden',!hasSelectedBr\)/);
 assert.match(ui,/developerBrProgressCount'\)\.classList\.remove\('hidden'\)/);
 assert.match(ui,/developerBrStart'\)\.parentElement\?\.classList\.remove\('hidden'\)/);
 assert.match(ui,/start\.disabled=!developerBrSelected/);
 assert.match(css,/\.developer-br-change-badge\.status-in-progress/);
});
