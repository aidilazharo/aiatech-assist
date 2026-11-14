'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..'),h=fs.readFileSync(path.join(base,'test/generated/extension-source.txt'),'utf8'),web=fs.readFileSync(path.join(base,'media/start.js'),'utf8');
const {generate}=require('../src/ux-frontend-code');
const role=require('../src/jira-role-eligibility');
test('frontend generates React TypeScript scaffold with Story and UI/UX provenance',()=>{
 const record={exists:true,status:'approved',key:'TC-392',revisionNumber:2,designFramework:'aia-qi',sourceStoryKey:'TC-390',prototype:{screens:[{name:'Dashboard',purpose:'Display system health',components:['Status card'],interactions:['Filter status']}]}};
 const doc=generate(record,record.sourceStoryKey),names=Object.keys(doc.files);
 assert.equal(names.length,4);assert.ok(names.every(n=>n.startsWith('src/atgv-design/tc-390/')));
 assert.match(doc.files[names.find(n=>n.endsWith('.tsx'))],/TC-392/);assert.match(doc.files[names.find(n=>n.endsWith('.tsx'))],/TC-390/);
});
test('frontend cannot be generated from draft or empty design',()=>{
 assert.throws(()=>generate({status:'review',exists:true,key:'TC-392',prototype:{screens:[]}},'TC-390'),/approved/);
 assert.throws(()=>generate({status:'approved',exists:true,key:'TC-392',prototype:{screens:[]}},'TC-390'),/screens/);
});
test('role task labels protect claim, while legacy unlabeled issues remain eligible',()=>{
 const issue={fields:{project:{key:'TC'},labels:['atgv-role-ux-designer']}};
 assert.equal(role.requireRole(issue,'ux-designer','TC'),'atgv-role-ux-designer');
 assert.throws(()=>role.requireRole(issue,'software-developer','TC'),/another SDLC role/);
 assert.equal(role.roleMatches([], 'software-developer'),true);
 assert.equal(role.storyKey({fields:{parent:{key:'TC-390'}}}),'TC-390');
 assert.equal(role.storyKey({fields:{parent:{key:'TC-120'}}},'Jira parent Story: TC-390'),'TC-390');
});
test('solution architect approval publishes pinned GitHub branch',()=>{
 assert.match(h,/case 'architectApproveStack':\{/);
 assert.match(h,/publishApprovedStack\(\{root,stackId:proof\.stackId/);
 assert.match(h,/remoteVerified:true/);
});
test('UI/UX uses one Generate & Publish UI/UX Code action for the full validated handoff',()=>{
 assert.match(h,/id="uxPublishFrontend"[^>]*>Generate &amp; Publish UI\/UX Code<\/button>/);
 assert.doesNotMatch(h,/id="uxGenerateFrontend"/);
 assert.match(web,/send\('uxPublishFrontend'/);
 assert.doesNotMatch(web,/send\('uxGenerateFrontend'/);
 assert.match(h,/case 'uxPublishFrontend':/);
 assert.match(h,/require\('\.\/ux-frontend-code'\)\.generate\(record,record\.sourceStoryKey\)/);
 assert.match(h,/publishDesign\(\{root,storyKey:output\.storyKey/);
 assert.match(h,/uxFrontendPublishCancelled/);
 assert.match(h,/type:'uxFrontendPublished',projectId,key/);
});
