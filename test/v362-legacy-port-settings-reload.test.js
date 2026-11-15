'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createRuntimeProxyOverlay,previewCommand}=require('../src/developer-git');

async function withRepo(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v362-proxy-'));
 try{
  execFileSync('git',['init','-q',root],{windowsHide:true});
  await fn(root);
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
test('legacy Vite API proxy follows alternate port without modifying original config',async()=>{
 await withRepo(async root=>{
  const original="export default {server:{proxy:{'/api':'http://127.0.0.1:3001'}}};\n";
  await fs.writeFile(path.join(root,'vite.config.ts'),original);
  const pkg={scripts:{dev:'concurrently -k "vite --host 127.0.0.1 --port 5173" "node server/index.mjs"'}};
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify(pkg));
  const overlay=await createRuntimeProxyOverlay(root,root,3002,original);
  assert.equal(overlay.kind,'vite');
  const code=await fs.readFile(overlay.location,'utf8');
  assert.match(code,/vite\.config\.ts/);
  assert.match(code,/3002/);
  assert.match(code,/mergeConfig/);
  assert.equal(await fs.readFile(path.join(root,'vite.config.ts'),'utf8'),original);
  const ignored=execFileSync('git',['-C',root,'check-ignore',overlay.file],{encoding:'utf8',windowsHide:true});
  assert.ok(ignored.includes(overlay.file));
  const cmd=await previewCommand({bin:'npm',args:['run','dev']},{kind:'npm',scripts:['dev']},root,'http://127.0.0.1:5174/',overlay);
  assert.match(cmd.args.join(' '),/--config vite\.config\.atgv-runtime-/);
  assert.match(cmd.args.join(' '),/--port 5174/);
  await fs.rm(overlay.location);
 });
});
test('legacy Angular CLI proxy is overridden at runtime without touching project files',async()=>{
 await withRepo(async root=>{
  const original='{"\\/api":{"target":"http://127.0.0.1:3001"}}\n';
  await fs.writeFile(path.join(root,'proxy.conf.json'),original);
  const pkg={scripts:{dev:'concurrently -k "ng serve --host 127.0.0.1 --port 4200" "node server/index.mjs"'}};
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify(pkg));
  const overlay=await createRuntimeProxyOverlay(root,root,3002,'');
  assert.equal(overlay.kind,'angular');
  const cfg=JSON.parse(await fs.readFile(overlay.location,'utf8'));
  assert.equal(cfg['/api'].target,'http://127.0.0.1:3002');
  assert.equal(await fs.readFile(path.join(root,'proxy.conf.json'),'utf8'),original);
  const cmd=await previewCommand({bin:'npm',args:['run','dev']},{kind:'npm',scripts:['dev']},root,'http://127.0.0.1:4201/',overlay);
  assert.match(cmd.args.join(' '),/--proxy-config proxy\.atgv-runtime-/);
  await fs.rm(overlay.location);
 });
});
test('UI removes obsolete settings hints, standardizes card headers and uses single-row GitHub inputs',async()=>{
 const html=await fs.readFile(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const css=await fs.readFile(path.join(__dirname,'../media/start.css'),'utf8');
 for(const sentence of ['Confluence spaces discovered here can be selected','The following configuration belongs to the opened project','These settings apply across projects','Scope: All projects'])
  assert.equal(html.includes(sentence),false,sentence);
 for(const phrase of ['Accessible repositories','Repository branch','List Repositories','id="githubRepoChoices"','id="listGithubRepos"'])
  assert.equal(html.includes(phrase),false,phrase);
 assert.match(html,/class="github-settings-toolbar"/);
 assert.match(css,/\.github-settings-toolbar\{[^}]*flex-wrap:nowrap/);
 assert.match(css,/#projectView \.project-settings-panel>\.project-settings-panel-summary\{[^}]*min-height:48px/);
 assert.match(ui,/function syncGithubRepositoryUrl/);
});
test('the verified VSIX install restarts automatically and regenerates the webview',async()=>{
 const host=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(host,/case 'installExtensionRelease':\{[\s\S]*?await restart\(\);break;/);
 assert.match(host,/await restart\(\);\n  \}catch\(error\)/);
 assert.match(host,/async function installationStartup\(\)/);
 assert.match(host,/atgvAssist\.restartAfterWindowReload/);
});
