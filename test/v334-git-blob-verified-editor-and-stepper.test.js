'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const {execFileSync}=require('node:child_process');
const vendor=require('../src/catalog-vendor-libraries');
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_AUTHOR_NAME:'ATGV Test',GIT_AUTHOR_EMAIL:'test@example.invalid',GIT_COMMITTER_NAME:'ATGV Test',GIT_COMMITTER_EMAIL:'test@example.invalid'}}).trim()}
test('checkout with platform-altered CRLF is repaired from pinned immutable Git blob, never by normalizing untrusted bytes',async(t)=>{
 const repo=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-cm-git-blob-'));
 try{
  try{git(repo,['init','-q']);}catch(e){t.skip('Git unavailable: '+e.message);return;}
  const relative='codemirror/LICENSE.txt',p=path.join(repo,'shared/libraries/webview/assets',relative);
  await fs.mkdir(path.dirname(p),{recursive:true});
  const original=Buffer.from('Test license\nsecond line\n');
  await fs.writeFile(p,original);git(repo,['add','.']);git(repo,['commit','-qm','valid pinned asset']);
  const commit=git(repo,['rev-parse','HEAD']);
  // Simulate Windows autocrlf checkout while retaining the original pinned blob.
  await fs.writeFile(p,original.toString('utf8').replaceAll('\n','\r\n'));
  assert.notEqual(digest(await fs.readFile(p)),digest(original));
  const expected={path:relative,bytes:original.length,sha256:digest(original)};
  const recovered=await vendor.verifiedGitBlob({catalogRoot:repo,commit,relative,expected});
  assert.deepEqual(recovered,original);
  await assert.rejects(vendor.verifiedGitBlob({catalogRoot:repo,commit,relative,expected:{...expected,sha256:digest('malicious')}}),/Unverified downloaded library/);
  await assert.rejects(vendor.verifiedGitBlob({catalogRoot:repo,commit,relative:'codemirror/../LICENSE.txt',expected:{...expected,path:'codemirror/../LICENSE.txt'}}),/Invalid webview library asset path/);
 }finally{await fs.rm(repo,{force:true,recursive:true});}
});
test('Image-only test retains stepper, but image-code tabs and replay sit above verdict on Results side',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const client=await fs.readFile(path.join(__dirname,'../media/library-studio.js'),'utf8');
 const left=host.slice(host.indexOf('id="libraryImageResultsPanel"'),host.indexOf('</section>',host.indexOf('id="libraryImageResultsPanel"')));
 const right=host.slice(host.indexOf('id="libraryHarnessTests"'),host.indexOf('id="libraryEditNotice"',host.indexOf('id="libraryHarnessTests"')));
 assert.match(left,/Run image-generation code[\s\S]*data-code-language="svg"[\s\S]*data-code-language="typescript"[\s\S]*data-code-language="csharp"[\s\S]*data-code-language="java"[\s\S]*libraryImageReplay[\s\S]*libraryImageVerdict/);
 assert.match(host,/id="libraryAgentDashboard"[\s\S]*libraryHarnessSteps[\s\S]*id="libraryHarnessSelector"/);
 assert.match(right,/Image-only agent test[\s\S]*libraryImagePrompt/);
 assert.doesNotMatch(right,/libraryImageReplay|libraryImageCodeDetails/);
 assert.match(client,/library-agent-step-circle/);
 assert.doesNotMatch(client,/eval\(|new Function\(/);
});
