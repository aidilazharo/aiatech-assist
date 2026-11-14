'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const region=host.slice(host.indexOf('<section id="developerTaskDashboard"'),host.indexOf('<section id="uxDesignWorkspace"'));
test('an explicit user AI action sends the scoped prompt without separate AI transmission dialog',async()=>{
 const a=host.indexOf('async function askAiSendConsent('),b=host.indexOf('\nlet developerBrRun=',a);assert.ok(a>0&&b>a);
 const src=host.slice(a,b);
 assert.doesNotMatch(src,/postMessage|uiWarning|askHostDialog/);
 const mod={};vm.runInNewContext(src+'\nthis.answer=askAiSendConsent',mod);
 assert.equal(await mod.answer('Scoped prompt'),true);
 assert.equal(await mod.answer('Prompt',{signal:{aborted:true}}),false);
 assert.doesNotMatch(host,/const proceed=await uiWarning\(`Generate, test, build and launch approved/);
 assert.match(host,/const yes=await uiWarning\(`Publish evidence for/);
});
test('Implementation Artifacts is removed from visible tabs while supporting saved draft code remains available',()=>{
 for(const name of ['code','tests','logs','server'])assert.match(region,new RegExp('data-developer-br-tab="'+name+'"'));
 assert.doesNotMatch(region,/data-developer-br-tab="artifacts"/);
 const beginning=region.indexOf('id="developerBrArtifactsPanel"'),editor=region.indexOf('id="developerArtifactViewer"'),manual=region.indexOf('id="developerManualTickets"');
 assert.ok(beginning>0&&beginning<editor&&editor<manual);
 assert.match(region,/<div id="developerBrAutoArtifacts"/);
 assert.match(ui,/function renderDeveloperBrArtifacts\(\)/);
 assert.match(ui,/developerBrTab==='artifacts'/);
 assert.match(css,/developer-br-auto-artifacts/);
});
test('Complete Delivery is outside hidden legacy panel, with only BR-correlated Jira issue selector',()=>{
 const delivery=region.indexOf('id="developerDeliveryPanel"'),legacy=region.indexOf('id="developerManualTickets"');
 assert.ok(delivery>0&&legacy>delivery);
 assert.match(region,/id="developerBrJiraSelect"/);
 assert.doesNotMatch(region,/Manual Jira task tools &amp; delivery evidence/);
 assert.match(region,/id="developerManualTickets" class="hidden" aria-hidden="true"/);
 assert.match(ui,/function matchingDeveloperBrTickets\(\)/);
 assert.match(ui,/developerAssignedMine\.filter/);
 assert.match(ui,/linked\.length>1&&!selected/);
 assert.match(ui,/const ready=linked&&developerBrDone&&!developerBrPreviewOnly&&!developerBrBusy/);
 assert.match(ui,/if\(!developerBrDone\|\|!developerSelectedTicket\|\|developerDeliveryBusy\|\|developerArtifactDirty\)return;/);
 assert.match(host,/case 'developerDeliveryComplete'/);
});
test('BR matching uses exact token boundary and never silently takes unrelated first Jira issue',()=>{
 const start=ui.indexOf('function matchingDeveloperBrTickets(){'),end=ui.indexOf('function syncDeveloperBrJira()',start);
 const snippet=ui.slice(start,end);
 const ctx={developerBrSelected:'BR-007',developerAssignedMine:[{key:'TC-1',brRoot:true,brId:'BR-007'},{key:'TC-2',brRoot:true,brId:'BR-0071'},{key:'TC-3',brRoot:false,brId:'BR-007'},{key:'TC-4',brRoot:true,brId:'BR-008'}]};
 vm.runInNewContext(snippet+'\nthis.matches=matchingDeveloperBrTickets()',ctx);
 assert.deepEqual([...ctx.matches.map(x=>x.key)],['TC-1']);
 assert.doesNotMatch(ui,/if\(mine\.length\)selectDeveloperTicket\(mine\[0\]\.key\)/);
});
