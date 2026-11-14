'use strict';
// Retire an exact, catalog-owned React task-demo test when building a DIFFERENT
// approved product in an isolated Developer worktree. It is not an acceptance
// test for the BR and must not force AI to recreate the scaffold demo UI.
// Only pinned, byte-verified template content is eligible; customized tests
// and the approved repository are never rewritten.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const STOCK_REACT_APP_TEST_SHA256 = new Set([
 '52a16e2cb95b5fa5c77c9cc5c321891b999e750e6fd071ebee2b6463b0b6e72a'
]);
const APP_TEST = path.join('src','App.test.tsx');
const hasTaskProduct = br => /\b(?:task management|task list|to-do|todo|manage tasks|task tracking)\b|\/api\/tasks\b/i.test(String(br||''));
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const normalize = text => String(text).replace(/\r\n/g,'\n');

const BR_NEUTRAL_REACT_SMOKE = `// ATGV verified starter migration: the catalog's demo-task assertions are not
// requirements for this BR. BR-specific RED tests remain mandatory and locked.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { App } from './App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('Application render smoke', () => {
  it('mounts the real App without crashing', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => [], text: async () => '',
    })));
    const { container } = render(<App />);
    expect(container.firstElementChild).not.toBeNull();
  });
});
`;

async function retireReactDemoTest({worktree,approvedRepository,storageRoot,projectId,brId,brText,stackId}){
 if(!/react/i.test(String(stackId||''))||hasTaskProduct(brText))return null;
 const worktreeRoot=await fs.realpath(worktree);
 const approvedRoot=await fs.realpath(approvedRepository);
 if(worktreeRoot===approvedRoot)throw Error('Starter-test migration requires an isolated worktree, not the approved repository.');
 const target=path.join(worktreeRoot,APP_TEST);
 const dir=await fs.lstat(path.dirname(target)).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!dir)return null;
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Unsafe React starter test directory; no files changed.');
 const stat=await fs.lstat(target).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat)return null;
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>24000)throw Error('Unsafe React starter test file; no files changed.');
 const original=await fs.readFile(target,'utf8');
 if(original===BR_NEUTRAL_REACT_SMOKE)return null;
 const demoAssertions=/name:\s*\/ATGV React\/i/.test(original)&&/name:\s*\/New task\/i/.test(original);
 if(!demoAssertions)return null;
 const digest=sha256(normalize(original));
 if(!STOCK_REACT_APP_TEST_SHA256.has(digest))throw Error('React App.test.tsx still asserts demo-only ATGV React/New task UI but is not an exact catalog starter. It may contain user changes: no files modified. Review this test against the approved BR.');
 if(!storageRoot||!projectId||!brId)throw Error('A protected storage root and BR identity are required before retiring a demo test.');
 const storage=await fs.realpath(storageRoot);
 const archiveDir=path.join(storage,'developer-starter-test-archives',sha256(`${projectId}:${brId}:${worktreeRoot}`));
 await fs.mkdir(archiveDir,{recursive:true,mode:0o700});
 const archive=path.join(archiveDir,`React-App-demo-test-${digest}.txt`);
 try{await fs.writeFile(archive,original,{flag:'wx',mode:0o600});}
 catch(e){
  if(e.code!=='EEXIST')throw e;
  if(await fs.readFile(archive,'utf8')!==original)throw Error('Starter test archive content mismatch; refusing to change test.');
 }
 // Preserve the original bytes if an intervening process modified the test.
 if(await fs.readFile(target,'utf8')!==original)throw Error('React starter test changed while preparing migration; no test changes applied.');
 await fs.writeFile(target,BR_NEUTRAL_REACT_SMOKE,'utf8');
 return {path:'src/App.test.tsx',previousSha256:digest,archive,reason:'Retired unrelated catalog demo UI assertions; kept neutral mount smoke and mandatory BR-specific TDD'};
}
// Catalog React includes a second demo-specific regression at server/api.test.mjs.
// It cannot remain a mandatory test after a BR has replaced the task demo.
// Only two byte-verified catalog versions are recognized; never retire user tests.
const STOCK_REACT_API_TEST_SHA256=new Set([
 '4d5a00a64ef6ab84fb71229efc624cd6d0bf6f04af225f7a356f16cbdcbc5bd3',
 '761a41a51af691f15772b429ba9dd624a5722e35f296983599ac967eff5fbc7f'
]);
const BR_NEUTRAL_REACT_API_SMOKE=`// ATGV audited migration: retain a real HTTP and SQLite startup regression.
// The catalog task CRUD test is archived; BR-specific API tests are mandatory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApp } from './index.mjs';

test('Application HTTP and SQLite bootstrap smoke', async () => {
 const folder=await mkdtemp(join(tmpdir(),'atgv-br-api-'));
 let server,client;
 try {
  const result=await makeApp('file:'+join(folder,'smoke.db'));
  client=result.client;
  assert.ok(result.app&&typeof result.app.listen==='function');
  server=result.app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/health');
  assert.equal(response.status,200);
  await response.arrayBuffer();
  const sqlite=await client.execute('SELECT 1 AS ok');
  assert.equal(Number(sqlite.rows[0].ok),1);
 } finally {
  try {if(server?.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  finally {try {if(client)await client.close();} finally {await rm(folder,{recursive:true,force:true,maxRetries:10,retryDelay:200});}}
 }
});
`;
async function retireReactDemoApiTest({worktree,approvedRepository,storageRoot,projectId,brId,brText,stackId}){
 if(!/react/i.test(String(stackId||''))||hasTaskProduct(brText))return null;
 const worktreeRoot=await fs.realpath(worktree);
 const approvedRoot=await fs.realpath(approvedRepository);
 if(worktreeRoot===approvedRoot)throw Error('Starter API test migration requires an isolated worktree, not the approved repository.');
 const target=path.join(worktreeRoot,'server','api.test.mjs');
 const dir=await fs.lstat(path.dirname(target)).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!dir)return null;
 if(!dir.isDirectory()||dir.isSymbolicLink())throw Error('Unsafe React starter API directory; no files changed.');
 const stat=await fs.lstat(target).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat)return null;
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>30000)throw Error('Unsafe React starter API test; no files changed.');
 const original=await fs.readFile(target,'utf8');
 if(original===BR_NEUTRAL_REACT_API_SMOKE)return null;
 const demoAssertions=/SQLite-backed task API supports create\/list\/delete/.test(original)&&/Example task/.test(original)&&/\/api\/tasks/.test(original);
 if(!demoAssertions)return null;
 const digest=sha256(normalize(original));
 if(!STOCK_REACT_API_TEST_SHA256.has(digest))throw Error('React server/api.test.mjs has task-demo assertions but is not an exact verified catalog starter. It may contain user changes: no files modified. Review this test against the approved BR.');
 if(!storageRoot||!projectId||!brId)throw Error('A protected storage root and BR identity are required before retiring an API demo test.');
 const storage=await fs.realpath(storageRoot);
 const archiveDir=path.join(storage,'developer-starter-test-archives',sha256(`${projectId}:${brId}:${worktreeRoot}`));
 await fs.mkdir(archiveDir,{recursive:true,mode:0o700});
 const archive=path.join(archiveDir,`React-API-demo-test-${digest}.txt`);
 try{await fs.writeFile(archive,original,{flag:'wx',mode:0o600});}
 catch(e){if(e.code!=='EEXIST')throw e;if(await fs.readFile(archive,'utf8')!==original)throw Error('Starter API test archive content mismatch; refusing to modify the test.');}
 if(await fs.readFile(target,'utf8')!==original)throw Error('React starter API test changed while preparing migration; no test changes applied.');
 await fs.writeFile(target,BR_NEUTRAL_REACT_API_SMOKE,'utf8');
 return {path:'server/api.test.mjs',previousSha256:digest,archive,reason:'Retired exact catalog-only task API assertions; preserved an HTTP/SQLite bootstrap regression and mandatory BR-specific TDD'};
}
module.exports={retireReactDemoTest,retireReactDemoApiTest,STOCK_REACT_APP_TEST_SHA256,STOCK_REACT_API_TEST_SHA256,BR_NEUTRAL_REACT_SMOKE,BR_NEUTRAL_REACT_API_SMOKE,hasTaskProduct};
