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
 assert.match(client,/repoOpenSource\.disabled=gitBusy\|\|!folderReady/);
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

test('project folder scan lists real immediate folders and rejects arbitrary or removed selection',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {projectFolders,selectProjectFolder}=require('../src/developer-my-work-git');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'atgv-chat-folders-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const parent=path.join(root,'repository');
 for(const name of ['app-a','app-b','node_modules','.hidden'])await fs.mkdir(path.join(parent,name),{recursive:true});
 await fs.mkdir(path.join(parent,'app-a','.git'));
 await fs.symlink(root,path.join(parent,'outside'),'junction');
 const rows=await projectFolders(root);
 assert.deepEqual(rows.map(x=>x.label),['app-a','app-b']);
 assert.ok(rows.every(x=>/^project:[a-f0-9]{64}$/.test(x.target)));
 assert.equal((await selectProjectFolder(root,'project',['app-b'])).label,'app-b');
 assert.equal((await selectProjectFolder(root,rows[0].target)).root,path.join(parent,'app-a'));
 await assert.rejects(selectProjectFolder(root,'project:../../outside'),/supported Developer repository/);
 await fs.rm(path.join(parent,'app-a'),{recursive:true});
 await assert.rejects(selectProjectFolder(root,rows[0].target),/no longer available/);
});

test('Developer repository toolbar scans folders, preserves open-only access and does not wrap',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..');
 const host=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
 const client=fs.readFileSync(path.join(root,'media/atgv-mywork-wave-chat.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'media/atgv-mywork-ai.css'),'utf8');
 const chat=fs.readFileSync(path.join(root,'src/my-work-role-chat.js'),'utf8');
 assert.match(host,/developerMyWorkGit\.projectFolders\(aiRoot\(\)\)/);
 assert.match(host,/developerMyWorkGit\.selectProjectFolder\(aiRoot\(\),kind/);
 assert.match(host,/selectedTarget:selected\.folder\.target,gitReady:false/);
 assert.match(host,/if\(!selected\.repo\|\|!selected\.local\)throw Error/);
 assert.match(client,/updateRepoFolders\(msg\.projectFolders,msg\.selectedTarget/);
 assert.match(client,/repoNext\.disabled=gitBusy\|\|!gitReady/);
 assert.match(client,/repoOpenSource\.disabled=gitBusy\|\|!folderReady/);
 assert.match(css,/\.developer-chat-repo-top\{display:flex;align-items:center;flex-wrap:nowrap/);
 assert.match(css,/\.developer-chat-repo-panel\{padding:6px 8px;overflow-x:auto/);
 assert.ok(chat.includes('/^project:[a-f0-9]{64}$/'));
});

test('dev-tools is a local Developer chat command and the live toolbar appears inside the transcript',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.join(__dirname,'..');
 const client=fs.readFileSync(path.join(root,'media/atgv-mywork-wave-chat.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
 const css=fs.readFileSync(path.join(root,'media/atgv-mywork-ai.css'),'utf8');
 assert.match(html,/<div id="developerChatToolsHome" hidden>[\s\S]*?<div id="developerChatRepoPanel"[^>]*hidden>/);
 assert.equal((html.match(/id="developerChatRepoPanel"/g)||[]).length,1);
 assert.match(client,/toolsMessage\.appendChild\(repoPanel\);transcript\.appendChild\(toolsMessage\);repoPanel\.hidden=false/);
 assert.match(client,/userText\.toLowerCase\(\)==='dev-tools'&&role==='software-developer'/);
 const submit=client.slice(client.indexOf("form.addEventListener('submit'"),client.indexOf("input.addEventListener('keydown'"));
 assert.ok(submit.indexOf('showDevTools();return;')<submit.indexOf("send('roleAiChat'"));
 assert.match(client,/hideDevTools\(\);transcript\.replaceChildren\(\)/);
 assert.match(client,/if\(repoPanel\)\{hideDevTools\(\);updateRepoFolders/);
 assert.match(css,/\.developer-chat-tools-message/);
});
