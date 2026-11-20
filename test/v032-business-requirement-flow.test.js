'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const review=require('../src/discovery-review');
const discovery=require('../src/ba-discovery');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const script=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
test('AI review parser only accepts controlled question keys and safe suggested answers',()=>{
 const raw=JSON.stringify({summary:'Two issues',readiness:'Needs attention',suggestions:[{key:'scope',severity:'High',issue:'Scope is ambiguous',suggestedAnswer:'In scope: portal registration. Out of scope: billing.'}]});
 const parsed=review.parseReviewResponse(raw);assert.equal(parsed.suggestions[0].key,'scope');assert.equal(parsed.suggestions[0].severity,'High');
 assert.throws(()=>review.parseReviewResponse(JSON.stringify({suggestions:[{key:'unknown',issue:'x',suggestedAnswer:''}]})),/invalid question key/);
 assert.match(review.createReviewPrompt(Object.fromEntries(discovery.QUESTIONS.map(([key])=>[key,'x']))),/suggestedAnswer/);
});
test('Business Requirement UI is one 9-stage flow with collapsed question groups and Quill BR preview',()=>{
 for(const text of ['Business Requirement','id="discoveryStepUpload"','Upload</span>','Map &amp; Save 12</span>','AI Review</span>','Generate Requirements</span>','Preview &amp; Save</span>','Approve Requirements</span>','Jira Preview</span>','Approve Preview</span>','Publish Jira</span>'])assert.ok(source.includes(text),text);
 assert.match(script,/document\.createElement\('details'\);section\.className='discovery-group'/);
 assert.match(script,/document\.createElement\('summary'\);summary\.className='discovery-group-head'/);
 assert.match(source,/id="brQuillEditor"/);assert.match(script,/new Quill\('#brQuillEditor'/);
 assert.match(source,/id="brJiraApprove"/);assert.match(source,/id="brJiraSync"[^>]*>Publish Jira</);
 assert.match(script,/preserveReviewOnSave/);assert.match(source,/Apply Answer Replacements/);
});
