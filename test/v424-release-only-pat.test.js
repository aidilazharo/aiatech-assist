'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const access=require('../src/lib/updates/release-pat-access');
const token='github_pat_TESTreleaseOnlyRead1234567890';
const valid=JSON.stringify([{tag_name:'v0.4.24'}]);
test('release-only PAT probes exactly the two trusted release endpoints with GET',async()=>{
 const calls=[];
 const verified=await access.verifyReadOnlyReleaseAccess(token,{request:async (url,opts)=>{
  calls.push({url,...opts});return Buffer.from(valid);
 }});
 assert.deepEqual(verified.results.map(x=>x.access),['PAT','PAT']);
 assert.deepEqual(calls.map(x=>x.url),[
  'https://api.github.com/repos/aidilazharo/aiatech-assist/releases?per_page=1',
  'https://api.github.com/repos/aidilazharo/tech-stacks-skills/releases?per_page=1'
 ]);
 assert.ok(calls.every(x=>x.token===token));
 assert.ok(calls.every(x=>x.url.startsWith('https://api.github.com/repos/')));
});
test('token may read one private release repo while other release repo is public',async()=>{
 const calls=[];
 const result=await access.verifyReadOnlyReleaseAccess(token,{request:async (url,{token:t})=>{
  calls.push({url,token:t});
  if(url.includes('tech-stacks-skills')&&t)throw Error('HTTP 404');
  return Buffer.from(valid);
 }});
 assert.deepEqual(result.results.map(x=>x.access),['PAT','public']);
 assert.equal(calls.length,3);
 assert.equal(calls[2].token,'');
});
test('reject empty, whitespace, malformed, and ineffective PATs',async()=>{
 for(const bad of ['', 'not-a-PAT-12345678901234567890','ghp_short','github_pat_bad key'])assert.throws(()=>access.normalizeToken(bad));
 await assert.rejects(access.verifyReadOnlyReleaseAccess(token,{request:async (_url,{token})=>{
  if(token)throw Error('HTTP 401');
  return Buffer.from('[]');
 }}),/did not authenticate/);
 await assert.rejects(access.verifyReadOnlyReleaseAccess(token,{request:async ()=>{
  throw Error('HTTP 404');
 }}),/Release access denied for/);
});
test('release token is stored only in SecretStorage, never supplied to issue or project actions',()=>{
 const root=path.join(__dirname,'..');
 const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 const markup=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
 const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
 assert.match(markup,/id="releaseDownloadPat" type="password"/);
 assert.match(markup,/id="saveReleaseDownloadPat"/);
 assert.match(markup,/id="clearReleaseDownloadPat"/);
 assert.match(markup,/Contents: Read-only/);
 assert.match(ui,/send\('saveReleaseDownloadPat',\{token\}\)/);
 assert.match(ui,/send\('clearReleaseDownloadPat'\)/);
 assert.match(host,/case 'saveReleaseDownloadPat':/);
 assert.match(host,/case 'clearReleaseDownloadPat':/);
 assert.match(host,/context\.secrets\.store\(RELEASE_DOWNLOAD_PAT_SECRET,token\)/);
 assert.match(host,/context\.secrets\.delete\(RELEASE_DOWNLOAD_PAT_SECRET\)/);
 const read=host.slice(host.indexOf('async function releaseAccessToken('),host.indexOf('// Only the host can confirm'));
 assert.match(read,/context\.secrets\.get\(RELEASE_DOWNLOAD_PAT_SECRET\)/);
 assert.doesNotMatch(read,/globalSecretKey\('github'\)/);
 assert.doesNotMatch(read,/vscode\.authentication\.getSession/);
 const issue=host.slice(host.indexOf('function openIssueReport('),host.indexOf('async function guarded('));
 assert.match(issue,/githubIssueAccessToken/);
 assert.doesNotMatch(issue,/releaseAccessToken/);
});
