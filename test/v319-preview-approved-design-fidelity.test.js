'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const preview=require('../src/developer-preview-mode');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const draft=host.slice(host.indexOf('async function runDeveloperDraftPreview('),host.indexOf('async function runDeveloperBrAutomation('));
const handoff=[{kind:'ux-ticket',sourceTicketKey:'TC-501',sourceStoryKey:'TC-500',number:4,designFramework:'aia-qi',
 screens:[{name:'People Dashboard',components:['Full navigation','People table'],interactions:['Open detail']},
 {name:'Edit Person',components:['Name field','Save'],interactions:['Update person']}]}];
test('v319 preview blocks silent fallback when approved designer handoff is missing',()=>{
 assert.throws(()=>preview.requireApprovedHandoff(null),/no approved design/);
 assert.throws(()=>preview.requireApprovedHandoff([{kind:'ux-ticket',screens:[]}]),/no approved design/);
 assert.deepEqual(preview.requireApprovedHandoff(handoff).revisions,[{kind:'ux-ticket',ticket:'TC-501',revision:4}]);
 assert.throws(()=>preview.requireApprovedHandoff([handoff[0],{...handoff[0],designFramework:'bootstrap-5.3'}]),/conflicting/);
});
test('v319 Preview Draft includes all approved screens and framework guidance rather than 6500-character summary',()=>{
 const longScreen='Design intent '.repeat(650);
 const prompt=preview.draftPrompt({brId:'BR-012',revision:1,brText:'Person names',stackId:'react',source:{files:['src/App.tsx'],previews:[]},
  approvedDesignHandoff:[...handoff,{kind:'design',screens:[{name:'Long screen',purpose:longScreen}],number:2}],
  designSystemGuide:'Version-pinned AIA QI components: qi-button, qi-card'});
 assert.match(prompt,/TC-501/);assert.match(prompt,/People Dashboard/);assert.match(prompt,/Edit Person/);
 assert.match(prompt,/qi-button, qi-card/);assert.ok(prompt.indexOf('Design intent ',prompt.indexOf('COMPLETE LINKED'))>=0);
 assert.match(prompt,/BYPASSING TESTS DOES NOT BYPASS THE APPROVED UI\/UX DESIGN/);
 assert.doesNotMatch(prompt,/\bRun npm test\b/i);
});
test('v319 bypass path performs approved design inspection with rollback and bounded regeneration, no test/build',()=>{
 for(const term of ['draft.requireApprovedHandoff(handoff)','catalog.designComponentsReference','draft.inspectRealPreview(run.worktree,handoff)',
  'developerTdd.restoreChanges(before)','designVerified','designFramework:design.framework'])assert.ok(draft.includes(term),term);
 assert.match(draft,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
 assert.ok(draft.indexOf('draft.requireApprovedHandoff(handoff)')<draft.indexOf('draft.draftPrompt('));
 assert.ok(draft.indexOf('draft.inspectRealPreview(run.worktree,handoff)')<draft.indexOf('launchUntestedDraftServer('));
 assert.doesNotMatch(draft,/await developerTdd\.runTests\(/);
 assert.doesNotMatch(draft,/await developerBR\.runChecks\(/);
 assert.ok(draft.includes('run.checksPassed=false')===false); // launchUntestedDraftServer owns untested status
});
test('v319 visual structure check rejects a generic React page and accepts named AIA QI screens',async()=>{
 const fsp=require('node:fs/promises'),os=require('node:os');
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv319-design-'));
 try{
  await fsp.mkdir(path.join(root,'src'),{recursive:true});
  await fsp.writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{react:'^19.0.0'}}));
  await fsp.writeFile(path.join(root,'index.html'),'<div id="root"></div>');
  await fsp.writeFile(path.join(root,'src/main.tsx'),"import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './App';import './styles.css';createRoot(document.getElementById('root')).render(<App/>);");
  await fsp.writeFile(path.join(root,'src/styles.css'),'.generic{padding:1rem}');
  await fsp.writeFile(path.join(root,'src/App.tsx'),"import React from 'react';export function App(){return <main><h1>Generic Person Names</h1><form onSubmit={()=>fetch('/api/people',{method:'POST'})}><input/><button>Add</button></form></main>}");
  let result=await preview.inspectRealPreview(root,handoff);assert.equal(result.passed,false);
  assert.match(result.issues.join(';'),/People Dashboard|AIA QI/);
  await fsp.writeFile(path.join(root,'src/styles.css'),'[data-theme=aia-qi]{--aia-qi-color-primary:#2189aa}');
  await fsp.writeFile(path.join(root,'src/App.tsx'),"import React from 'react';export function App(){return <main data-theme='aia-qi'><h1>People Dashboard</h1><section><h2>Edit Person</h2><form onSubmit={()=>fetch('/api/people',{method:'POST'})}><input/><button>Add</button></form></section></main>}");
  result=await preview.inspectRealPreview(root,handoff);assert.equal(result.passed,true,result.issues.join(';'));
 }finally{await fsp.rm(root,{recursive:true,force:true});}
});
