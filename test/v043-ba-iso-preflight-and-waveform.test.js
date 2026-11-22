'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const ba=read('media/ba-automatic-ui.js');
const ui=read('media/start.js');
const css=read('media/start.css');
const wave=read('media/atgv-mywork-wave-chat.js');
const headerCss=read('media/atgv-mywork-ai.css');
function rule(selector){
 const i=css.indexOf(selector+'{');
 assert.ok(i>=0,'CSS rule missing: '+selector);
 return css.slice(i+selector.length+1,css.indexOf('}',i));
}
test('one preserved AI preflight component belongs to its own Business Documents tab, not Uploaded Documents',()=>{
 assert.equal((html.match(/id="baSourcePreflight"/g)||[]).length,1);
 assert.equal((html.match(/id="baAutoIsoPreflight"/g)||[]).length,1);
 const iso=html.indexOf('id="baAutoIsoPreflight"'),details=html.indexOf('id="baSourcePreflight"');
 const editor=html.indexOf('id="baAutoArtifactText"');
 assert.ok(iso>=0&&details>iso&&editor>details);
 const sourcePanel=html.slice(html.indexOf('<section class="source-documents-panel"'),html.indexOf('id="discoveryImportPanel"'));
 assert.ok(!sourcePanel.includes('id="baSourcePreflight"'),'preflight must not be repeated beneath uploaded files');
 assert.match(html,/id="baAutoDocumentTabs"/);
 assert.match(html,/data-ba-document="iso"/);
 assert.match(ba,/get\('baAutoIsoPreflight'\)\.hidden=!preflight/);
 assert.match(ba,/get\('baAutoDocumentPanel'\)\.hidden=preflight/);
 assert.match(ba,/renderArtifacts\(\);\s*requestArtifact\(\)/);
});
test('preflight exports stay outside collapsed findings and retain existing action handlers',()=>{
 const begin=html.indexOf('id="baAutoIsoPreflightActions"');
 const details=html.indexOf('<details id="baSourcePreflight"',begin);
 assert.ok(begin>=0&&details>begin);
 const tools=html.slice(begin,details);
 for(const id of ['baPreflightDownload','baWorkingBrDownload','baPreflightRetry','baPreflightSkip'])
  assert.ok(tools.includes('id="'+id+'"'),id);
 assert.match(html,/Download Pre-flight Analyst/);
 assert.match(html,/Download ISO 29148 Business Requirements/);
 assert.match(ui,/panel\.open=false;panel\.dataset\.lastPhase=phase/);
 assert.match(ui,/send\('downloadDocumentPreflight',\{projectId:activeId\}\)/);
 assert.match(ui,/send\('downloadISO29148BRPDF',\{projectId:activeId\}\)/);
 assert.match(css,/#discoveryView #baAutoIsoPreflight\[hidden\]/);
});
test('circular workflow steps are centered, connected and visibly animate while running',()=>{
 const steps=rule('.ba-auto-steps');
 const item=rule('.ba-auto-steps li');
 const circle=rule('.ba-auto-steps li > span');
 const connector=rule('.ba-auto-steps li:not(:last-child)::after');
 const spin=rule('.ba-auto-steps li[data-state="running"] > span::before');
 const pulse=rule('.ba-auto-steps li[data-state="running"] > span::after');
 assert.match(steps,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(item,/flex-direction:column;align-items:center;text-align:center/);
 assert.match(circle,/width:38px;height:38px/);
 assert.match(connector,/top:18px/);
 assert.match(connector,/left:calc\(50% \+ 24px\)/);
 assert.match(spin,/animation:ba-stage-spin/);
 assert.match(pulse,/animation:ba-stage-pulse/);
 assert.match(css,/\.ba-auto-steps li > span\{width:32px;height:32px/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\.ba-auto-steps li\[data-state="running"\] > span::before,\.ba-auto-steps li\[data-state="running"\] > span::after\{animation:none\}\}/);
});
test('BA waveform remains visible when idle and activates only for running preparation',()=>{
 assert.match(ba,/const showingBusinessRequirements=selectedRole==='business-analyst'/);
 assert.match(ba,/document\.body\.classList\.toggle\('atgv-ba-ai-active',showingBusinessRequirements\)/);
 assert.match(ba,/setBusinessRequirementsActivity\?\.\(aiWorking\)/);
 assert.match(ba,/setBusinessRequirementsVisible\?\.\(showingBusinessRequirements\)/);
 assert.match(ba,/ATGVSyncMyWorkHeaderWaveHost\?\.\(\)/);
 assert.match(wave,/let brActivity=false,brVisible=false/);
 assert.match(wave,/setBusinessRequirementsVisible\(active\)/);
 assert.match(wave,/if\(brVisible\)requestAnimationFrame\(resize\)/);
 assert.match(wave,/else if\(brVisible\)/);
 assert.match(wave,/targetOpacity=\.62;targetSpeed=reduceMotion\?0:\.32/);
 assert.match(wave,/colorMix=smooth\(colorMix,brActivity\|\|engaged\|\|idle<3\.9\?1:0/);
 assert.match(headerCss,/body\.atgv-ba-ai-active:not\(\.gate-mode\) #appHeader #myWorkHeaderWave/);
 assert.match(headerCss,/body\.atgv-ba-ai-active:not\(\.gate-mode\) #topNotification #myWorkHeaderWave/);
 assert.match(ui,/document\.body\.classList\.contains\('atgv-ba-ai-active'\)/);
 assert.match(ui,/window\.ATGVSyncMyWorkHeaderWaveHost=syncMyWorkHeaderWaveHost/);
});
