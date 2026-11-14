'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const tdd=require('../src/developer-tdd');
const {validateLockfile}=require('../src/ux-story-dependencies');
test('DELETE behavior cannot prescribe HTTP 204 unless approved BR explicitly does',()=>{
 const files=[{path:'server/br-007-ac10.test.mjs',content:"assert.strictEqual(response.status, 204);"}];
 assert.deepEqual(tdd.unsupportedDeleteStatusPaths(files,{description:'A name can be deleted',acceptance:'The record disappears'},'Remove a saved person'),['server/br-007-ac10.test.mjs']);
 assert.deepEqual(tdd.unsupportedDeleteStatusPaths(files,{description:'A name can be deleted',acceptance:'HTTP 204 No Content'},'Remove a saved person'),[]);
});
test('Story lockfile matches approved npm dependencies',()=>{
 const pkg={dependencies:{react:'^19.0.0'},devDependencies:{vite:'^6.0.0'},scripts:{test:'node --test',build:'vite build'}};
 const lock={lockfileVersion:3,packages:{'':{dependencies:{react:'^19.0.0'},devDependencies:{vite:'^6.0.0'}}}};
 assert.doesNotThrow(()=>validateLockfile(lock,pkg));
 assert.throws(()=>validateLockfile({...lock,packages:{'':{dependencies:{react:'^18.0.0'},devDependencies:{vite:'^6.0.0'}}}},pkg),/does not match/);
});
test('UI/UX publication includes a validated Story lockfile in permitted Git stage',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/git-handoff-coordinator.js'),'utf8');
 assert.match(src,/const dependencyFiles=verification\.dependencyFiles\|\|\[\]/);
 assert.match(src,/dependencyFiles\.some\(x=>x!=='package-lock\.json'\)/);
 assert.match(src,/\.\.\.dependencyFiles\]\)/);
});
