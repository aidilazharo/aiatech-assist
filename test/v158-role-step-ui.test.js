'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const extension=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');const client=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
test('role workflow has functional controls and host handlers for persisted output state',()=>{
 for(const id of ['roleStepFlow','roleStepScope','roleStepLoadScope','roleStepButtons','roleStepProgress','roleStepStatus','roleStepOutputs','roleStepReviewer','roleStepNewTitle','roleStepNewEvidence','roleStepAddOutput','roleStepNext','roleConsolidation'])assert.ok(extension.includes('id="'+id+'"'),id);
 for(const msg of ['roleStepLoadScope','roleStepAction','roleStepScopeLoaded']){assert.ok(extension.includes(msg),msg);assert.ok(client.includes(msg),msg);}
 assert.match(client,/function renderRoleStepFlow/);assert.match(client,/renderProjectSdlcSummary/);
});
