'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scan,assertInspected}=require('../src/developer-initial-source-scan');
test('initial scan uses pinned project source and excludes secrets; existing replacements require full context',async()=>{
 const sha='a'.repeat(40),calls=[];
 const git=async(root,...args)=>{assert.equal(root,'/project-worktree');calls.push(args);
 if(args[0]==='rev-parse')return sha;
 if(args[0]==='ls-tree')return ['100644 blob '+sha+' 30\tsrc/App.tsx','100644 blob '+sha+' 20\tserver/index.js','100644 blob '+sha+' 10\t.env'].join('\n');
 return args[1].endsWith('App.tsx')?'export const App=()=>null;':'export const server=1;';
 };
 const result=await scan('/project-worktree',{sha,git,analyze:async batch=>JSON.stringify({summary:'Existing app and API',paths:['src/App.tsx']})});
 assert.equal(result.scanned,2);assert.equal(result.paths.length,3);
 assert.ok(!calls.some(a=>a[1]===sha+':.env'));
 assertInspected([{path:'src/App.tsx'},{path:'src/new.ts'}],result);
 assert.throws(()=>assertInspected([{path:'server/index.js'}],result),/without full source/);
});
