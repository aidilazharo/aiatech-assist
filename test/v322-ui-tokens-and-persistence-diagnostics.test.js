'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const design=JSON.parse(fs.readFileSync(path.join(root,'design-system/atgv-ui-theme.json'),'utf8'));
const css=fs.readFileSync(path.join(root,'media/atgv-ui-theme.css'),'utf8');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const pack=fs.readFileSync(path.join(root,'scripts/package-vsix.py'),'utf8');
const tdd=require('../src/developer-tdd');
test('v322: a single JSON design system owns sizing, text hierarchy, colors, animation',()=>{
 assert.equal(design.version,'1.0.1');
 assert.equal(design.progress.responsive,true);
 assert.equal(design.progress.rotationDurationMs,1000);
 assert.equal(design.progress.circleDiameterPx,46);
 assert.equal(design.progress.pulseDurationMs,1700);
 assert.deepEqual([design.typography.bodyPx,design.typography.pageTitlePx,design.typography.sectionTitlePx,design.typography.labelPx],[13,20,16,12]);
 for(const key of ['foreground','background','surface','border','muted','focus'])assert.ok(design.theme[key].includes('var(--vscode-'),key);
 assert.equal(design.accessibility.reducedMotionSupported,true);
 assert.deepEqual(Object.keys(design.components),['overviewRing','baMilestone','uxMilestone','roleStepper','developerTdd']);
});
test('v322: all circular progress indicators derive 46px from one CSS variable',()=>{
 assert.match(css,/--atgv-ui-circle: 46px/);
 for(const selector of Object.values(design.components)){
  assert.ok(css.includes(selector),`missing circle selector ${selector}`);
 }
 assert.match(css,/--atgv-tdd-circle:var\(--atgv-ui-circle\)!important/);
 assert.match(css,/atgv-ui-active-ring var\(--atgv-ui-pulse-duration\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/animation:none!important/);
 assert.match(css,/--atgv-ui-body: 13px/);
});
test('v322: generated CSS stays in sync and is loaded AFTER other extension stylesheets',()=>{
 const check=spawnSync(process.execPath,[path.join(root,'scripts/generate-ui-theme.js'),'--check'],{cwd:root,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 assert.match(host,/const uiThemeCss=webview\.asWebviewUri/);
 const html=host.match(/<link rel="stylesheet" href="\$\{css\}">[^\n]+/);
 assert.ok(html);
 assert.ok(html[0].indexOf('href="${uiThemeCss}"')>html[0].indexOf('href="${aiChangeResolutionCss}"'));
 assert.match(pack,/['"]design-system['"]/);
});
test('v322: AC-06 URL-stack diagnosis retains full runner evidence and separates mocks from implementation',()=>{
 const summary='AssertionError: expected missing UI name';
 const full='RangeError: Maximum call stack size exceeded\n at URLStateMachine\n at whatwg-url/lib/URL.js\n at tr46/index.js';
 assert.equal(tdd.diagnoseGreenFailure(summary).kind,'assertion');
 const diagnosis=tdd.diagnoseGreenFailure([summary,full].join('\n'));
 assert.equal(diagnosis.kind,'fetch-url-recursion');
 assert.match(diagnosis.advice,/Run this persistence test alone/);
 assert.match(host,/const completeFailureEvidence=failed\.flatMap\(row=>\[row\.failureDetails\|\|'',row\.logs\|\|''\]\)/);
 assert.match(host,/diagnoseGreenFailure\(completeFailureEvidence\)/);
});
