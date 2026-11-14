'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const preview=require('../src/architect-preview-worktree');
const run=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
test('Approved preview is detached at pinned revision while Developer branch and dirty files remain untouched',async t=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v209-preview-'));
 try{
  const root=path.join(tmp,'repo');await fs.mkdir(root);run(root,'init','-b','main');run(root,'config','user.email','test@example.com');run(root,'config','user.name','ATGV Test');
  await fs.writeFile(path.join(root,'README.md'),'project');run(root,'add','.');run(root,'commit','-m','base');
  run(root,'switch','-c','bootstrap/react-reset-1');await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'test-app',version:'1.0.0',scripts:{dev:'node server.js',test:'node --test',build:'node --check server.js'}}));await fs.writeFile(path.join(root,'server.js'),'console.log("run")');run(root,'add','.');run(root,'commit','-m','approved starter');const sha=run(root,'rev-parse','HEAD');
  run(root,'switch','-c','feature/tc-296');await fs.writeFile(path.join(root,'draft.txt'),'uncommitted Developer work');
  const before=run(root,'status','--porcelain');assert.match(before,/draft\.txt/);
  const result=await preview.prepare({root,branch:'bootstrap/react-reset-1',sha});
  assert.equal(result.sha,sha);assert.equal(run(result.root,'rev-parse','HEAD'),sha);assert.equal(run(root,'branch','--show-current'),'feature/tc-296');assert.equal(run(root,'status','--porcelain'),before);
  const again=await preview.prepare({root,branch:'bootstrap/react-reset-1',sha});assert.equal(again.root,result.root);
  await assert.rejects(preview.prepare({root,branch:'bootstrap/react-reset-1',sha:'a'.repeat(40)}),/moved since validation/);
  const pathToPreview=result.root;
  await fs.writeFile(path.join(pathToPreview,'server.js'),'modified');
  await assert.rejects(preview.prepare({root,branch:'bootstrap/react-reset-1',sha}),/local changes/);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('Removed Process Progress & Messages UI; original circular progress is visible for every role',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const webview=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const css=await fs.readFile(path.join(__dirname,'../media/start.css'),'utf8');
 assert.doesNotMatch(host,/Process Progress &amp; Messages|id="processActivityRows"|id="roleProcessRows"/);
 assert.match(host,/id="roleStepButtons" class="role-circle-steps"/);
 assert.match(host,/class="role-legacy-hidden" aria-hidden="false"/);
 assert.match(webview,/legacySteps.setAttribute\('aria-hidden','false'\)/);
 assert.match(css,/#workView \.role-legacy-hidden\{display:block!important/);
 assert.match(css,/#workView\.role-ba-simplified > \.role-overview,/);
 assert.match(css,/#workView\.role-pm-dashboard > \.role-overview\{display:block!important/);
});
