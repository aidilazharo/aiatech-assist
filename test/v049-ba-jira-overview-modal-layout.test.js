'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('src/lib/webview/dashboard-html.js');
const ui=read('media/start.js');
const css=read('media/start.css');

test('Business Requirements circles remain accessible without a redundant Workflow title',()=>{
 const progressStart=html.indexOf('<section class="ba-auto-progress" aria-label="Business Requirements workflow">');
 assert.ok(progressStart>0);
 const progressEnd=html.indexOf('</section>',progressStart);
 const block=html.slice(progressStart,progressEnd);
 assert.match(block,/<ol class="ba-auto-steps" id="baAutoSteps" aria-busy="false">/);
 assert.doesNotMatch(block,/<strong>Workflow<\/strong>/);
 assert.equal((block.match(/data-ba-auto-stage="/g)||[]).length,4);
 assert.match(css,/\.ba-auto-steps\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test('BA overview puts the in-progress requirement ahead of Jira and removes the redundant outer card',()=>{
 const main=html.indexOf('<section id="baRequirementsOverview"');
 const first=html.indexOf('<section id="baUncompletedPanel"',main);
 const second=html.indexOf('<section id="baJiraInventorySection"',main);
 const end=html.indexOf('<section id="pmDailyCockpit"',main);
 assert.ok(main>=0&&first>main&&second>first&&end>second,'in-progress must be the first overview section');
 assert.match(css,/#workView\.ba-project-overview > #baRequirementsOverview\{/);
 const layoutStart=css.indexOf('/* v0.0.49 — BA Jira overview');
 const ruleStart=css.indexOf('#workView.ba-project-overview > #baRequirementsOverview{',layoutStart);
 const overviewStyle=css.slice(ruleStart,css.indexOf('}',ruleStart));
 assert.match(overviewStyle,/padding:0!important/);
 assert.match(overviewStyle,/border:0!important/);
 assert.match(overviewStyle,/background:transparent!important/);
 assert.match(css,/#workView\.ba-project-overview #baUncompletedPanel\{[\s\S]{0,190}order:0/);
 assert.match(css,/#workView\.ba-project-overview #baJiraInventorySection\{[\s\S]{0,190}order:1/);
 assert.match(html,/id="baOverviewNew"/);
 assert.match(html,/id="baResumeIncomplete"/);
 assert.match(html,/id="baJiraInventoryTable"/);
});

test('BR details modal is outside hidden discovery/baStartPanel and opens on the Jira overview',()=>{
 const discoveryStart=html.indexOf('<section id="discoveryView"');
 const overviewStart=html.indexOf('<section id="baRequirementsOverview"');
 const modalStart=html.indexOf('<div id="baRequirementModal"');
 const pmStart=html.indexOf('<section id="pmDailyCockpit"');
 assert.ok(discoveryStart>=0&&overviewStart>discoveryStart);
 assert.ok(modalStart>overviewStart&&modalStart<pmStart,'BR modal must be a direct visible workView child');
 assert.doesNotMatch(html.slice(discoveryStart,overviewStart),/id="baRequirementModal"/);
 assert.equal((html.match(/id="baRequirementModal"/g)||[]).length,1);
 assert.equal((html.match(/id="baRequirementModalContent"/g)||[]).length,1);
 assert.match(css,/#workView #baRequirementModal\.modal-overlay\{/);
 assert.match(css,/#workView #baRequirementModalContent\{/);
 assert.match(css,/#workView #baRequirementModalContent \.ba-completed-br-section\{/);
 assert.match(ui,/function openBARequirementModal\(ref,openAnswers=false\)\{/);
 assert.match(ui,/if\(ref\.kind==='local'\)renderBACompletedRecords\(\);else renderBAJiraBackedEpics\(\)/);
 assert.match(ui,/open\.addEventListener\('click',event=>\{event\.stopPropagation\(\);openBARequirementModal\(ref\);\}\)/);
 assert.match(ui,/onRowClick:item=>\{if\(item\._isJiraIssue===false\)openBARequirementModal\(item\._brRoots\[0\]\);else openJiraIssueModal\(item\.key\);\}/);
 assert.match(ui,/if\(view==='baOverview'&&next!=='baOverview'[\s\S]*?closeBARequirementModal\(false\)/);
});

test('Jira-only BRs remain read-only and are not fabricated from missing local discovery data',()=>{
 const jira=read('media/ba-jira-epics.js');
 assert.match(jira,/hasAnswers:false/);
 assert.match(ui,/ba-jira-answers-unavailable/);
 assert.match(ui,/answers\.disabled=true/);
 assert.match(ui,/Jira only · no local BR evidence/);
 assert.match(ui,/syncBARequirementModal\(\)/);
});
