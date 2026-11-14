'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const child=require('node:child_process');
const handoff=require('../src/developer-design-handoff');
const production=require('../src/developer-final-ui');
const host=require('node:fs').readFileSync(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
async function temp(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv279-'));try{return await fn(dir);}finally{await fs.rm(dir,{force:true,recursive:true});}}
const sample=(key,story,hash,status='approved')=>({schema:1,key,revisionNumber:3,status,
 sourceStoryKey:story,sourceBRHash:hash,reviewedBy:'Design Reviewer',reviewedAt:'2026-11-11T04:00:00.000Z',
 designFramework:'bootstrap-5.3',
 prototype:{screens:[{name:'People',purpose:'Manage persons',components:['Name input','Add button','People list','Edit and delete actions'],interactions:['Add name','Delete existing name']}]},
 handoff:{summary:'Ready-to-build people screen',accessibility:['Keyboard accessible']},flow:{nodes:[{label:'Enter a name'},{label:'Manage entries'}]}
});
const hash='e'.repeat(64);
async function store(root,record){const folder=path.join(root,'documents','jira-designs',record.key);await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'ui-ux-workflow.json'),JSON.stringify(record));}
const register={brs:[{id:'BR-007',status:'approved',approvedRevision:1}],synced:{'BR-007':{key:'TC-400'},'BR-007/AC-01':{key:'TC-401'},'BR-009':{key:'TC-600'}}};
test('linked approved UI/UX ticket feeds final developer implementation; draft, wrong BR and wrong hash are excluded',()=>temp(async root=>{
 await store(root,sample('TC-405','TC-401',hash));
 await store(root,sample('TC-406','TC-600',hash));
 await store(root,sample('TC-407','TC-401',hash,'review'));
 await store(root,sample('TC-408','TC-401','f'.repeat(64)));
 const designs=await handoff.ticketDesignsForBr(root,register,'BR-007',{approvedHash:hash});
 assert.equal(designs.length,1);assert.equal(designs[0].sourceTicketKey,'TC-405');
 assert.equal(designs[0].designFramework,'bootstrap-5.3');
 assert.equal(designs[0].screens[0].components[1],'Add button');
 assert.equal((await handoff.ticketDesignsForBr(root,register,'BR-009',{approvedHash:hash})).length,1);
 assert.equal((await handoff.ticketDesignsForBr(root,register,'BR-008',{approvedHash:hash})).length,0);
}));
async function runnable(root,{placeholder=false,badRoot=false,bootstrap=false}={}){
 await fs.mkdir(path.join(root,'src'),{recursive:true});
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{react:'^19.0.0'}}));
 await fs.writeFile(path.join(root,'index.html'),'<html><body><div id="root"></div></body></html>');
 await fs.writeFile(path.join(root,'src/main.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import App from './App';import './style.css';createRoot(document.getElementById('${badRoot?'app':'root'}')).render(<App />);`);
 await fs.writeFile(path.join(root,'src/App.jsx'),`import React from 'react';export default function App(){return <main><label>Name<input aria-label="Name"/></label><button type="button" onClick={()=>fetch('/api/people',{method:'POST'})}>Add</button>${placeholder?'<p>Component interaction and API integration to be implemented.</p>':''}</main>;}`);
 await fs.writeFile(path.join(root,'src/style.css'),bootstrap?'@import "bootstrap/dist/css/bootstrap.min.css";':'.page { display:grid; }@media(max-width:600px){.page{display:block}}');
}
const design=[{kind:'ux-ticket',designFramework:'aia-qi',screens:[{name:'People',components:['Name input','Add button']}] }];
test('final frontend gate passes a real mounted interactive application',()=>temp(async root=>{
 await runnable(root);
 const result=await production.inspect(root,design);assert.equal(result.passed,true,JSON.stringify(result.issues));
 assert.equal(result.skipped,false);assert.ok(result.filesChecked>=3);
}));
test('final frontend gate rejects mockup placeholders, React mount mismatches and scaffold as the app',()=>temp(async root=>{
 await runnable(root,{placeholder:true,badRoot:true});
 let result=await production.inspect(root,design);
 assert.equal(result.passed,false);assert.match(result.issues.join(';'),/unfinished UI marker|createRoot targets/);
 await fs.writeFile(path.join(root,'src/main.jsx'),"import {AtgvDesignScreens} from './atgv-design/tc-400/Screens';createRoot(document.getElementById('root')).render(<AtgvDesignScreens/>);");
 result=await production.inspect(root,design);
 assert.match(result.issues.join(';'),/preview scaffold/);
}));
test('preview-only local React state cannot satisfy an approved persistent Add flow',()=>temp(async root=>{
 await runnable(root);
 const file=path.join(root,'src/App.jsx');
 await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace(" onClick={()=>fetch('/api/people',{method:'POST'})}",''));
 const result=await production.inspect(root,design);
 assert.equal(result.passed,false);assert.match(result.issues.join(';'),/actual API integration/);
}));
test('bootstrap final app uses bootstrap styling, not an unrelated generic theme',()=>temp(async root=>{
 await runnable(root);
 const selected=[{...design[0],designFramework:'bootstrap-5.3'}];
 let result=await production.inspect(root,selected);
 assert.equal(result.passed,false);assert.match(result.issues.join(';'),/Bootstrap v5.3/);
 await fs.writeFile(path.join(root,'src/style.css'),'@import "bootstrap/dist/css/bootstrap.min.css";');
 result=await production.inspect(root,selected);assert.equal(result.passed,true);
}));
test('final UI AI prompt requires the actual integrated app, approved framework and real backend',()=>{
 const text=production.implementationPrompt({brText:'Name management',brId:'BR-007',revision:1,
  source:{files:['src/App.jsx'],previews:[]},approvedDesignHandoff:design,designSystemGuide:'AIA QI token catalog'});
 for(const term of ['FINAL, RUNNABLE','real backend API actions','approved','atgv-design','AIA QI token catalog','src/App.jsx'])assert.ok(text.includes(term),term);
 assert.doesNotMatch(text,/Return an SVG mockup/);
});
test('developer orchestration loads approved ticket workflow and blocks placeholder app before build success',()=>{
 const run=host.slice(host.indexOf('async function runDeveloperBrAutomation('),host.indexOf('async function runDeveloperDeliveryChecks('));
 assert.match(run,/approvedHash:require\('\.\/design-proposals'\)\.approvedInputs\(register\)\.hash/);
 assert.match(run,/developer-final-ui/);
 assert.match(run,/finalUi\.implementationPrompt/);
 assert.match(run,/finalUi\.inspect\(run\.worktree,approvedDesignHandoff\)/);
 assert.match(run,/restoreChanges\(before\)/);
 assert.ok(run.indexOf('finalUi.implementationPrompt')<run.indexOf("record.steps.build=true"));
 assert.match(run,/Server repair invalidated the approved final UI/);
});
