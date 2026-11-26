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

test('Developer source button uses the selected verified checkout in a separate VS Code window',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
 const client=fs.readFileSync(path.join(root,'media/atgv-mywork-wave-chat.js'),'utf8');
 const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 assert.match(html,/<button type="button" id="developerChatOpenSource"[^>]*disabled>Open Source Code<\/button>/);
 assert.match(client,/repoOpenSource\.disabled=gitBusy\|\|!gitReady/);
 assert.match(client,/repoOpenSource\.addEventListener\('click',\(\)=>requestGit\('open-source'\)\)/);
 assert.match(client,/repositoryTarget:repoSelect\.value,requestId:\+\+gitRequest,action/);
 const start=host.indexOf('async function developerChatGitAction(msg){');
 const end=host.indexOf('\nasync function ',start+1);
 assert.ok(start>=0&&end>start);
 const handler=host.slice(start,end);
 assert.match(handler,/msg\.projectId!==projectId\|\|msg\.roleId!=='software-developer'/);
 assert.match(handler,/const selected=await developerChatRepository\(projectId,kind\)/);
 const open=handler.match(/else if\(msg\.action==='open-source'\)\{([\s\S]*?)\n  \}else if/);
 assert.ok(open);
 assert.match(open[1],/activeProject\?\.id!==projectId/);
 assert.match(open[1],/vscode\.commands\.executeCommand\('vscode\.openFolder',vscode\.Uri\.file\(selected\.root\),\{forceNewWindow:true\}\)/);
 assert.doesNotMatch(open[1],/getGithubToken|\.act\(|switch|commit|push|revealFileInOS/);
});
