'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {target,branchName,safeStaged,stage,summarize}=require('../src/developer-my-work-git');
test('repository selector rejects arbitrary paths and branch names',()=>{
 assert.equal(target('extension'),'extension');
 assert.throws(()=>target('../other'));
 assert.equal(branchName('fix/runtime-startup'),'fix/runtime-startup');
 assert.throws(()=>branchName('main'));
});
test('Git ring measures actual recorded branch, commit, PR and publication',()=>{
 const local={branch:'fix/runtime',sha:'a',clean:true};
 for(const [state,percent] of [[{},0],[{branch:local.branch},25],[{branch:local.branch,sha:'a'},50],[{branch:local.branch,sha:'a',pr:'url'},75],[{branch:local.branch,sha:'a',pr:'url',published:true},100]])assert.equal(stage(state,local).percent,percent);
 assert.equal(stage({branch:local.branch,sha:'a',pr:'url',published:true},{...local,sha:'b'}).percent,25);
 assert.equal(stage({branch:local.branch,sha:'a',pr:'url'},{...local,clean:false}).percent,25);
});
test('only safe staged paths and allowlisted diagnostic signatures are shared',()=>{
 assert.equal(safeStaged('src/app.js'),true);
 for(const name of ['.env','src/.env.local','private.pem','.atgv/private.json','node_modules/test.js'])assert.equal(safeStaged(name),false);
 const logs=summarize('npm ERR! ERESOLVE\nGitHub error 403\npassword=secret');
 assert.ok(logs.some(x=>x.label==='npm dependency / lockfile'));
 assert.ok(!JSON.stringify(logs).includes('secret'));
});
