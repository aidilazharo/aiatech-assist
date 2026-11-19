'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const page=read('src/lib/webview/dashboard-html.js');
const ui=read('media/start.js');
const styles=read('media/start.css');
const host=read('src/lib/runtime/extension-runtime.js');
const extension=require('../src/lib/updates/github-release-updater');
const library=require('../src/lib/updates/library-release-updater');

test('release discovery queries public mirror repositories only',()=>{
 assert.deepEqual(extension.RELEASE_REPOSITORIES,['aidilazharo/extension']);
 assert.deepEqual(library.RELEASE_REPOSITORIES,['aidilazharo/library']);
 assert.ok(!extension.RELEASE_REPOSITORIES.includes('aidilazharo/aiatech-assist'));
 assert.ok(!library.RELEASE_REPOSITORIES.includes('aidilazharo/tech-stacks-skills'));
 assert.equal(extension.PINNED_RELEASE_URL,'https://github.com/aidilazharo/aiatech-assist/releases/latest');
 assert.equal(library.LATEST_URL,'https://github.com/aidilazharo/tech-stacks-skills/releases/latest');
});
test('startup boots prerequisites on webview readiness and hides optional Copilot SDK',()=>{
 assert.match(host,/type:'startupSavedFields'/);
 assert.match(ui,/message\.type==='startupSavedFields'/);
 assert.match(ui,/startupPrereqRequested=true;/);
 assert.match(ui,/send\('startupReadiness'\);/);
 assert.match(page,/id="startupCopilotCard"[^>]*class="[^"]*startup-copilot-card" hidden/);
 assert.match(styles,/#startupCopilotCard\{display:none!important\}/);
 assert.doesNotMatch(page,/<p>Checking permissions…<\/p>/);
});
test('project opening checks Jira and Confluence concurrently',()=>{
 assert.match(host,/\[account,space\]=await Promise\.all\(/);
 assert.match(host,/testJiraConnection\(config,token\),getConfluenceSpace\(config,token\)/);
 assert.match(styles,/#gateFinder \.gate-result button:disabled/);
 assert.match(page,/id="gateProgress"/);
});
test('AI review findings remain ordered by question number',()=>{
 assert.match(ui,/const sortedFindings=\[/);
 assert.match(ui,/BA_QUESTIONS\.findIndex/);
 assert.match(ui,/for\(const item of sortedFindings\)/);
});
test('generation preview/save and approval have separate stage content and no approval on unsaved draft',()=>{
 for(const id of ['brStageTitle','brStageDescription','brGenerateSummary'])assert.ok(page.includes('id="'+id+'"'),id);
 assert.match(ui,/documentStageCopy=\{/);
 assert.match(ui,/documentsPanel\.dataset\.step=displayed/);
 assert.match(styles,/\.br-workflow-panel\[data-step="generate"\] #brCards/);
 assert.match(ui,/editorMilestone==='save'/);
 assert.match(ui,/editorMilestone==='approve'/);
 assert.match(ui,/draftSavedAt\)add\('draftSaved'/);
});
