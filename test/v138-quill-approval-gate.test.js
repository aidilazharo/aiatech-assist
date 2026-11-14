'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ui=fs.readFileSync(path.join(__dirname,'..','media','start.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
const start=ui.indexOf('function brApprovalPrerequisites(br){');
const end=ui.indexOf('function updateBREditorActions(){',start);
assert.ok(start>0&&end>start);
const factory=new vm.Script(ui.slice(start,end)+'\nbrApprovalPrerequisites;');
const base=()=>({
 brReadOnly:false,baBusyTask:'',brEditorSaving:false,brEditorDirty:false,
 roleSettings:{enabled:['business-analyst']},
 baReviewCurrent:()=>true,discoveryHasReviewBlockers:()=>false,
 discoveryData:{readiness:{filled:12,total:12,canReview:true}},
 brState:{discoveryRevision:'discovery-v1',importDigest:'a',importEpoch:1,sourceConflicts:[],changeQueue:[]}
});
const br={id:'BR-002',status:'draft',draftSavedAt:'2026-11-01T12:00:00Z',draftSource:{discoveryRevision:'discovery-v1',digest:'a',epoch:1}};
const evaluate=(patch={},doc=br)=>factory.runInNewContext({...base(),...patch})(doc);
test('acknowledged AI warnings with all Discovery decisions resolved do not block approval',()=>{
 assert.deepEqual(Array.from(evaluate()),[]);
});
test('acknowledged AI findings do not falsely resolve open Question 12 decisions',()=>{
 const x=evaluate({discoveryData:{readiness:{filled:12,total:12,canReview:false,needsDecision:true}}});
 assert.equal(x.length,1);assert.equal(x[0].key,'discovery');assert.match(x[0].message,/Question 12/);
});
test('incomplete Discovery and unacknowledged review each show distinct blockers',()=>{
 const x=evaluate({discoveryData:{readiness:{filled:10,total:12,canReview:false}},discoveryHasReviewBlockers:()=>true});
 assert.deepEqual(Array.from(x,x=>x.key),['review','discovery']);
});
test('independent Business Owner approval remains required even after AI acknowledgment',()=>{
 const x=evaluate({roleSettings:{enabled:['business-analyst','business-owner']}});
 assert.deepEqual(Array.from(x,x=>x.key),['businessOwner']);
 const y=evaluate({roleSettings:{enabled:['business-analyst','business-owner']}},{...br,businessApproval:{decision:'approved'}});
 assert.deepEqual(Array.from(y),[]);
 const unsaved=evaluate({roleSettings:{enabled:['business-analyst','business-owner']},brEditorDirty:true});
 assert.equal(unsaved[0].key,'businessOwner');assert.match(unsaved[0].message,/Save edited content/);
});
test('stale draft, unowned document, pending changes and conflicts never enable approval',()=>{
 assert.deepEqual(Array.from(evaluate({brReadOnly:true}),x=>x.key),['ownership']);
 assert.deepEqual(Array.from(evaluate({}, {...br,draftSource:{...br.draftSource,discoveryRevision:'old'}}),x=>x.key),['draftSource']);
 const x=evaluate({brState:{...base().brState,sourceConflicts:[{id:'conflict1',brId:'BR-002'}],changeQueue:[{status:'pending',targetIds:['BR-002']}]}},br);
 assert.deepEqual(Array.from(x,z=>z.key),['conflict','changes']);
});
test('Quill renders actionable prerequisites beside the Save and Approve controls',()=>{
 assert.match(host,/id="brApprovalGuidance"/);
 assert.match(host,/id="brApprovalGuidanceList"/);
 assert.match(host,/id="brApprovalEditDiscovery"/);
 assert.match(host,/id="brApprovalReviewAI"/);
 assert.ok(host.indexOf('id="brApprovalGuidance"')<host.indexOf('id="brEditApprove"'));
 assert.match(ui,/brApprovalEditDiscovery'\)\.addEventListener\('click'/);
 assert.match(ui,/if\(!closeBREditor\(\)\)return/);
});
