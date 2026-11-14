'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');const designs=require('../src/design-proposals');
const proposedApi={title:'Customer API',summary:'Proposal',endpoints:[{method:'POST',path:'/customers',operation:'Register',request:'registration data',response:'created id',authorization:'Authenticated'}],assumptions:[],questions:[]};
const proposedDatabase={title:'Customer database',summary:'Proposal',entities:[{name:'Customer',description:'Registered customer',fields:[{name:'id',type:'UUID',required:true,key:true}],relationships:[]}],assumptions:[],questions:[]};
test('new API and Database design categories generate validated and editable Markdown drafts',()=>{
 assert.equal(designs.KINDS.api,'Application Programming Interface Design');assert.equal(designs.KINDS.database,'Database Design');
 assert.match(designs.markdown(designs.validate(proposedApi,'api')),/POST \/customers/);
 assert.match(designs.markdown(designs.validate(proposedDatabase,'database')),/Customer[\s\S]*UUID/);
 assert.match(designs.prompt('api',{entries:[]}),/endpoints/);
 assert.match(designs.prompt('database',{entries:[]}),/entities/);
 assert.throws(()=>designs.validate({...proposedApi,endpoints:[{method:'INVALID',path:'/test'}]},'api'),/method/);
 assert.throws(()=>designs.validate({...proposedDatabase,entities:[{name:'Customer',fields:[]}]},'database'),/1–45/);
});
test('progressive stages show only active panels and keep protected approval checks',()=>{
 const host=fs.readFileSync(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8'),ui=fs.readFileSync(path.join(__dirname,'..','media','start.js'),'utf8');
 assert.match(host,/id="baNewRequirement"[^>]*>\+ New Business Requirement<\/button>/);
 assert.match(host,/id="baStartPanel"/);
 assert.match(host,/id="sourceSelectionActions"/);
 assert.match(host,/id="discoveryQuestionsPanel"/);
 assert.match(ui,/showSources/);
 assert.match(ui,/showQuestions/);
 assert.match(ui,/showReview/);
 assert.match(ui,/showDocuments/);
 assert.match(ui,/showJira/);
 assert.match(ui,/const reviewGood=reviewCurrent&&baMappingComplete\(\)&&baReviewFinalized\(\)/);
 assert.match(ui,/baReviewBadge'\)\.classList\.toggle\('hidden',!current/);
});
test('review issue count appears alongside title, not as a second pill',()=>{
 assert.match(host,/AI Review &amp; Suggestions <span id="baReviewCount"/);
 assert.match(ui,/\(\$\{issues\} issue/);
 assert.match(ui,/baReviewBadge'\)\.classList\.toggle\('hidden',!current/);
});
test('generation button distinguishes new documents from revisions and retains draft gate',()=>{
 assert.match(ui,/brs\.length\?'Update Business Requirements Documents':'Generate Business Requirements Documents'/);
 assert.match(ui,/brGenerate:!!baBusyTask\|\|!mine\|\|!\(brState\?\.sourceDocuments\|\|\[\]\)\.length\|\|!reviewGood\|\|freshDraftPending\|\|generatingDone/);
});
test('one active progress indicator and webview-host dialog replace extension confirmation popups',()=>{
 assert.match(css,/#discoveryView #baRunning:not\(\.hidden\)\{display:grid!important\}/);
 assert.match(host,/id="hostDialog" class="modal-overlay hidden"/);
 assert.match(host,/case 'hostDialogResponse'/);
 assert.match(ui,/function resolveHostDialog\(accepted\)/);
 assert.match(host,/async function uiWarning\(/);
 assert.match(host,/async function uiInput\(/);
 assert.match(host,/async function uiQuickPick\(/);
});
test('menu name covers product, API, and database design workspace',()=>{
 assert.match(host,/>Solution Designs<\/button>/);
 assert.match(host,/>Solution Designs<\/h1>/);
 assert.match(ui,/\['api','API Design'\]/);
 assert.match(ui,/\['database','Database Design'\]/);
});
