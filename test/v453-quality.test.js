'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const quality=require('../src/jira-preview-quality');
test('Jira rerun impact distinguishes safe updates, skips and AC/DoD warnings',()=>{
 const p=[{path:'BR-001',kind:'Epic',action:'update',key:'TC-100',title:'Project'},
 {path:'BR-001/F-1/S-1',kind:'Story',action:'update',key:'TC-101',title:'Story'},
 {path:'BR-002',kind:'Epic',action:'create',title:'New'}];
 const report=quality.assess(p,{synced:{'BR-001':{key:'TC-100'},'BR-001/F-1/S-1':{key:'TC-101'},'BR-001/F-2':{key:'TC-111'}}});
 assert.equal(report.counts.create,1);assert.equal(report.counts.update,2);
 assert.equal(report.counts.skip,1);assert.equal(report.warnings.length,2);
 assert.equal(report.eligible,true);
 assert.equal(quality.assess([{path:'BR-001',action:'update',key:'invalid',title:'A'}]).eligible,false);
});
