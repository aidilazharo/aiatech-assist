'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const jiraEpics=require('../media/ba-jira-epics');
const dir=path.resolve(__dirname,'..');
const ui=fs.readFileSync(path.join(dir,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(dir,'media/start.css'),'utf8');
const segment=ui.slice(ui.indexOf('function renderBAJiraBackedEpics(){'),ui.indexOf('function renderBACompletedRecords(){'));

function element(tag,className='',content=''){
 return {
  tagName:tag.toUpperCase(),className,textContent:content,dataset:{},children:[],handlers:{},
  disabled:false,open:false,attributes:{},title:'',
  append(...nodes){this.children.push(...nodes);},
  replaceChildren(){this.children=[];},
  querySelectorAll(selector){
   if(selector==='details.ba-jira-only-br-section[open]')
    return this.children.filter(c=>c.tagName==='DETAILS'&&c.className.includes('ba-jira-only-br-section')&&c.open);
   return [];
  },
  addEventListener(type,cb){this.handlers[type]=cb;},
  setAttribute(name,value){this.attributes[name]=String(value);}
 };
}
function harness(){
 const root=element('div'),opened=[];
 const jiraItems=[
  {key:'TC-761',type:'Epic',summary:'BR-001: Person Name CRUD Interface',status:'To Do'},
  {key:'TC-762',type:'Story',summary:'Create person name',parentKey:'TC-761'}
 ];
 const source=[
  "const rootNode=$('baJiraBackedEpics');",
  "const projectConnectionsSnapshot={jira:{key:'TC'}};",
  "const activeId='active-project',jiraInventoryProject='active-project',jiraInventoryKey='TC';",
  "const jiraInventoryItems=arguments[5],jiraInventoryRunning=false;",
  segment,
  "return renderBAJiraBackedEpics;"
 ].join('\n');
 const run=new Function('$','brElement','ATGVCompletedBRHistory','completedBARecords','ATGVBAJiraEpics','items','document','openJiraIssueModal',source);
 const render=run(
  id=>id==='baJiraBackedEpics'?root:null,element,
  {group:()=>[]},()=>[],jiraEpics,jiraItems,
  {createElement:tag=>element(tag)},
  key=>opened.push(key)
 );
 return {render,root,opened};
}
test('Jira-only Epic uses identical completed BR accordion structure, without duplicating the BR ID',()=>{
 assert.ok(segment.startsWith('function renderBAJiraBackedEpics(){'));
 const {render,root,opened}=harness();render();
 assert.equal(root.children.length,1);
 const card=root.children[0],heading=card.children[0],body=card.children[1];
 assert.equal(card.tagName,'DETAILS');
 assert.equal(card.className,'ba-completed-br-section ba-jira-only-br-section');
 assert.equal(card.open,false);
 assert.equal(heading.tagName,'SUMMARY');
 assert.equal(heading.className,'ba-completed-br-heading');
 assert.equal(heading.children[0].className,'ba-completed-br-title');
 assert.equal(heading.children[0].textContent,'BR-001 · Person Name CRUD Interface');
 assert.match(heading.children[1].textContent,/To Do · Unlinked to local BR/);
 const answers=heading.children[2],jira=heading.children[3];
 assert.equal(answers.textContent,'View 12 Answers');
 assert.equal(answers.disabled,true);
 assert.match(answers.attributes['aria-label'],/unavailable/);
 assert.equal(jira.textContent,'View Jira · 1 linked');
 assert.equal(body.className,'ba-completed-br-body');
 assert.match(body.children[0].children[1].textContent,/Jira alone cannot reconstruct it/);
 let prevented=false,stopped=false;
 jira.handlers.click({preventDefault(){prevented=true},stopPropagation(){stopped=true}});
 assert.deepEqual(opened,['TC-761']);
 assert.equal(prevented,true);assert.equal(stopped,true);
});
test('a refreshed Jira inventory retains expanded state and never represents Jira-only Epic as approved',()=>{
 const {render,root}=harness();render();
 root.children[0].open=true;render();
 assert.equal(root.children[0].open,true);
 assert.doesNotMatch(root.children[0].children[0].children[1].textContent,/Approved R|Completed/);
 assert.doesNotMatch(segment,/send\(|saveBR|brPublish|\\.approvedRevision\s*=/);
});
test('Jira-only rows inherit completed BR CSS instead of a separate large-card layout',()=>{
 assert.match(css,/#discoveryView \.ba-completed-flat \.ba-jira-only-br-section\{margin:0 0 9px\}/);
 assert.match(css,/#discoveryView \.ba-completed-flat \.ba-jira-only-br-section \.ba-completed-br-body/);
 assert.match(css,/#discoveryView \.ba-completed-flat :is\(\.ba-completed-br-section/);
 assert.doesNotMatch(css,/\.ba-jira-recovery-item/);
});
