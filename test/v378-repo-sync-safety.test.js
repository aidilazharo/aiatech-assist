'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const sync=require('../src/repo-sync-pr');
const workspace=require('../src/repo-sync-workspace');
const pkg=require('../package.json');

test('v0.3.78 version metadata and single-action UI with both PAT roles',()=>{
 assert.equal(pkg.version,'0.3.78');
 assert.equal(pkg.atgvDisplayVersion,pkg.version);
 const html=workspace.workspaceHtml({nonce:'safe',version:pkg.version,cspSource:'vscode-resource:'});
 for(const label of ['Source · Repo A','Destination · Repo B','Source branch name','Destination GitHub URL','outside ATGV workspace','Sync Repo A → Repo B','PATs'])assert.ok(html.includes(label),label);
 assert.equal((html.match(/id="createPr"/g)||[]).length,1);
});
test('Repo B folder must be outside ATGV workspace before any process begins',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-repo-path-test-'));
 try{
  const child=path.join(tmp,'project');fs.mkdirSync(child);
  const token='ghp_'+'x'.repeat(40);
  const args={sourceUrl:'https://github.com/Test/repo-a',destinationUrl:'https://github.com/Test/repo-b',sourcePat:token,destPat:token,runner:async()=>{throw Error('No Git commands may run before this check.');}};
  await assert.rejects(()=>sync.sync({...args,destinationFolder:child,workspaceRoot:tmp}),/outside the current ATGV workspace/);
  await assert.rejects(()=>sync.sync({...args,destinationFolder:tmp,workspaceRoot:child}),/outside the current ATGV workspace/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
