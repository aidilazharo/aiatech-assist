'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const model=require('../media/ba-jira-epics');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function group(id,jiraKey,{answers=true,issues=[]}={}){return {id,title:id+' · Example',snapshots:[{br:{id,title:'Example',jiraKey,jiraIssues:issues},cycle:{discoveryAnswers:answers?{q1:'answer'}:{}}}]};}
test('BR rows use exact links, retain every Jira issue and distinguish missing Jira Epics',()=>{
 const items=[
  {key:'TC-1',type:'Epic',summary:'BR-001: Example',status:'To Do'},
  {key:'TC-2',type:'Story',parentKey:'TC-1',summary:'Story'},
  {key:'TC-3',type:'Subtask',sourceStoryKey:'TC-2',summary:'Task'},
  {key:'TC-9',type:'Epic',summary:'BR-001: Different requirement',status:'In Progress'},
  {key:'TC-10',type:'Task',parentKey:'TC-9',summary:'Unlinked task'},
  {key:'TC-20',type:'Bug',summary:'Unrelated bug'}
 ];
 const groups=[group('BR-001','TC-1',{issues:[{key:'TC-1',path:'BR-001',kind:'Epic'},{key:'TC-2',path:'BR-001/Story',kind:'Story'}]}),group('BR-002','TC-404')];
 const {rows,refs}=model.combine(items,groups,'TC');
 assert.equal(rows.filter(row=>row._isJiraIssue).length,items.length);assert.equal(rows.filter(row=>row.key==='TC-1').length,1);
 const byKey=key=>rows.find(row=>row.key===key);
 assert.equal(byKey('TC-1')._brRoots[0].scopeId,'BR-001');assert.equal(byKey('TC-3')._brRefs[0].scopeId,'BR-001');
 const unlinked=byKey('TC-9')._brRoots[0];assert.equal(unlinked.kind,'jira');assert.equal(unlinked.scopeId,'jira:TC-9');assert.equal(unlinked.hasAnswers,false);
 assert.deepEqual(byKey('TC-10')._brRefs.map(ref=>ref.scopeId),['jira:TC-9']);assert.deepEqual(byKey('TC-20')._brRefs,[]);
 const local=byKey('TC-404');assert.equal(local._isJiraIssue,false);assert.equal(local.type,'Business Requirement');assert.equal(local.status,'Approved locally');
 assert.ok(refs.find(ref=>ref.scopeId==='BR-001').hasAnswers);assert.ok(refs.find(ref=>ref.scopeId==='BR-002'));
 assert.ok(items.every(item=>!('_brRefs' in item)),'shared Jira inventory must not be mutated');
});
test('shared links and cyclic Jira parents do not hide or merge BR evidence',()=>{
 const items=[{key:'TC-1',type:'Epic',parentKey:'TC-2'},{key:'TC-2',type:'Story',parentKey:'TC-1'}];
 const {rows}=model.combine(items,[group('BR-001','TC-1'),group('BR-002','TC-1',{answers:false})],'TC');
 assert.equal(rows.length,2);assert.deepEqual(rows[0]._brRoots.map(ref=>ref.scopeId),['BR-001','BR-002']);
 assert.deepEqual(rows[1]._brRefs.map(ref=>ref.scopeId),['BR-001','BR-002']);
 assert.deepEqual(rows[0]._brRoots.map(ref=>ref.hasAnswers),[true,false]);
});

test('BR cards are hosted in an accessible details modal within the combined Jira view',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js');
 assert.match(html,/id="baRequirementModal"/);assert.match(html,/id="baRequirementModalContent"/);
 assert.match(html,/id="baCompletedList" class="hidden"/);assert.match(html,/id="baJiraBackedEpics" class="ba-jira-recovery hidden"/);
 assert.match(ui,/ATGVBAJiraEpics\.combine\(/);assert.match(ui,/label:'Business Requirement'/);
 assert.match(ui,/openBARequirementModal\(/);assert.match(ui,/closeBARequirementModal\(/);
});

test('combined table keeps BR links and filters without redundant row-action buttons',()=>{
 const ui=read('media/start.js'),from=ui.indexOf('function renderBAJiraInventory(){'),to=ui.indexOf('// Project Manager My Work',from);assert.ok(from>=0&&to>from);
 function element(tag='div'){
  const handlers={};return {tagName:tag.toUpperCase(),children:[],dataset:{},value:'',className:'',textContent:'',disabled:false,
   classList:{add(){},toggle(){}},append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];},
   get options(){return this.children;},setAttribute(){},addEventListener(type,fn){handlers[type]=fn;},click(){if(!this.disabled)handlers.click?.({stopPropagation(){}});}};
 }
 const ids=['baJiraInventorySection','baJiraInventoryStatus','baJiraInventoryTable','baJiraInventoryTitle','baJiraInventoryRefresh','baReviewDeletedJira','baJiraBrFilter','baJiraTypeFilter','baJiraStatusFilter','baJiraListView','baJiraTreeView','baJiraHierarchy'];
 const nodes=Object.fromEntries(ids.map(id=>[id,element()]));
 const data=[{key:'TC-1',type:'Epic',summary:'BR-001: Example',status:'To Do'},{key:'TC-2',type:'Story',parentKey:'TC-1',summary:'Story'},
  {key:'TC-9',type:'Epic',summary:'BR-003: Jira only',status:'To Do'}];
 const groups=[group('BR-001','TC-1'),group('BR-002','TC-404')],opened=[],filters=[],jira=[],capture={};
 const tables={mount(_root,rows,columns,options){Object.assign(capture,{rows,columns,options});return {setRows(next){capture.rows=next;}};}};
 const prelude=[
  "const projectConnectionsSnapshot={jira:{key:'TC'}};let activeId='P',jiraInventoryProject='P',jiraInventoryKey='TC',jiraInventoryRunning=false,jiraInventoryError='',jiraInventoryLoaded=true,jiraInventoryTruncated=false,jiraInventoryViewerId='',baJiraView='list',baJiraTableInstance=null;",
  "const brState={deletedRequirements:[]},jiraInventoryItems=data;",
  'function completedBARecords(){return groups}function renderBAJiraBackedEpics(){}function renderBAJiraHierarchy(){}',
  'function prioritizeJiraCreators(rows){return rows}function updateBAJiraFilterOptions(){}'
 ].join('\n');
 const make=new Function('document','$','ATGVBAJiraEpics','ATGVCompletedBRHistory','ATGVDataTables','data','groups','openBARequirementModal','openBRJiraInventory','openJiraIssueModal',prelude+ui.slice(from,to)+';return renderBAJiraInventory;');
 const render=make({createElement:element},id=>nodes[id],model,{group:x=>x},tables,data,groups,(ref,answers)=>opened.push([ref.scopeId,!!answers]),id=>filters.push(id),id=>jira.push(id));
 render();assert.equal(capture.rows.length,4);assert.equal(capture.rows.filter(row=>row.key==='TC-1').length,1);
 const brColumn=capture.columns.find(column=>column.key==='brLabel');assert.ok(brColumn);
 const all=node=>[node,...node.children.flatMap(all)],linked=brColumn.render(capture.rows.find(row=>row.key==='TC-1'));
 assert.ok(all(linked).some(node=>node.textContent==='BR-001'));
 assert.equal(all(linked).find(node=>node.textContent==='View 12 Answers'),undefined);
 assert.equal(all(linked).find(node=>node.textContent.startsWith('View Jira')),undefined);
 assert.deepEqual(opened,[]);assert.deepEqual(filters,[]);
 const unlinked=brColumn.render(capture.rows.find(row=>row.key==='TC-9'));
 assert.equal(all(unlinked).find(node=>node.textContent==='View 12 Answers'),undefined);
 assert.ok(all(unlinked).some(node=>node.textContent==='Jira only · no local BR evidence'));
 all(unlinked).find(node=>node.textContent==='BR-003').click();assert.deepEqual(opened.at(-1),['jira:TC-9',false]);
 capture.options.onRowClick(capture.rows.find(row=>row.key==='TC-404'));assert.deepEqual(opened.at(-1),['BR-002',false]);
 capture.options.onRowClick(capture.rows.find(row=>row.key==='TC-2'));assert.deepEqual(jira,['TC-2']);
 nodes.baJiraBrFilter.value='BR-001';render();assert.deepEqual(capture.rows.map(row=>row.key),['TC-1','TC-2']);
 nodes.baJiraBrFilter.value='jira:TC-9';render();assert.deepEqual(capture.rows.map(row=>row.key),['TC-9']);
});

test('BR details modal opens saved answers and clears stale content after a project switch',()=>{
 const ui=read('media/start.js'),from=ui.indexOf('function syncBARequirementModal(){'),to=ui.indexOf('function renderBAJiraInventory(){',from);assert.ok(from>=0&&to>from);
 const document={activeElement:{isConnected:true,focus(){document.activeElement=this;}}},prior=document.activeElement;
 function element(){return {children:[],dataset:{},attributes:{},scrollTop:0,parentElement:null,textContent:'',open:false,classList:{add(){},remove(){}},
  append(node){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(item=>item!==node);node.parentElement=this;this.children.push(node);},
  replaceChildren(...children){this.children.forEach(node=>node.parentElement=null);this.children=[];children.forEach(node=>this.append(node));},
  get firstElementChild(){return this.children[0]||null;},setAttribute(key,value){this.attributes[key]=value;},focus(){document.activeElement=this;},querySelector(){return this.answerTab||null;}};}
 const ids=['baRequirementModal','baRequirementModalTitle','baRequirementModalContent','baRequirementModalClose','baCompletedList','baJiraBackedEpics','baJiraBrFilter'];
 const nodes=Object.fromEntries(ids.map(id=>[id,element()]));let answerClicks=0;
 const prelude=["let baRequirementModalTarget=null,baRequirementPriorFocus=null,activeId='P';",
  "function renderBACompletedRecords(){const card=make();card.dataset.requirementTarget='BR-001';card.answerTab={parentElement:card,click:()=>answers()};$('baCompletedList').replaceChildren(card);syncBARequirementModal();}",
  "function renderBAJiraBackedEpics(){const card=make();card.dataset.jiraKey='TC-9';$('baJiraBackedEpics').replaceChildren(card);syncBARequirementModal();}"
 ].join('\n');
 const create=new Function('document','$','make','answers',prelude+ui.slice(from,to)+';return {open:openBARequirementModal,close:closeBARequirementModal,sync:syncBARequirementModal,refresh:renderBACompletedRecords,setProject:x=>activeId=x};');
 const modal=create(document,id=>nodes[id],element,()=>answerClicks++);
 modal.open({kind:'local',scopeId:'BR-001',label:'BR-001',title:'BR-001 · Example'},true);
 assert.equal(nodes.baRequirementModal.attributes['aria-hidden'],'false');assert.equal(nodes.baRequirementModalContent.children[0].open,true);assert.equal(answerClicks,1);
 modal.refresh();assert.equal(nodes.baRequirementModalContent.children.length,1);assert.equal(answerClicks,1,'refresh must preserve the selected tab without reopening it');
 modal.close();assert.equal(nodes.baRequirementModal.attributes['aria-hidden'],'true');assert.equal(document.activeElement,prior);assert.equal(nodes.baCompletedList.children.length,1);
 modal.open({kind:'jira',scopeId:'jira:TC-9',rootKey:'TC-9',title:'Jira-only Epic'});modal.setProject('OTHER');modal.sync();
 assert.equal(nodes.baRequirementModal.attributes['aria-hidden'],'true');assert.equal(nodes.baRequirementModalContent.children.length,0);assert.equal(nodes.baJiraBackedEpics.children.length,0);
});
