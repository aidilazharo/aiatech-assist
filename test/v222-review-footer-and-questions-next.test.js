'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('12-question Save action becomes Next Step AI Review only after a current persisted save',()=>{
 assert.match(ui,/const discoveryAdvanceReady=savedDiscovery&&mappingDone/);
 assert.match(ui,/discoveryAction.type=discoveryAdvanceReady\?'button':'submit'/);
 assert.match(ui,/discoveryAction.textContent=discoveryAdvanceReady\?'Next Step · AI Review':'Save 12 Questions'/);
 assert.match(ui,/discoveryAction.disabled=discoveryAdvanceReady\?!!baBusyTask:/);
 assert.match(ui,/discoverySave:saved&&!discoveryDirty&&current.filled===current.total&&baMappingComplete\(\)\?/);
 assert.match(ui,/if\(\$\('discoverySave'\)\.type!=='button'\|\|\$\('discoverySave'\)\.disabled\|\|discoveryDirty\)return/);
 assert.match(ui,/openBAWorkflowStep\('review'\)/);
 assert.match(ui,/if\(!discoveryData\|\|!discoveryDirty\|\|\$\('discoverySave'\)\.disabled\)return/);
});

test('Step 3 completion footer is hidden without disabling later-step navigation',()=>{
 assert.match(ui,/navigation\.classList\.toggle\('hidden',displayed==='start'\)/);
 assert.match(ui,/previousButton\.dataset\.previousStep=previousDefinition\?.key\|\|''/);
 assert.match(ui,/\$\('baNextStep'\)\.addEventListener\('click'/);
 assert.match(host,/id="baNextStepRow"/);
});

test('all AI Review controls live after findings in the review footer, not in the summary',()=>{
 const start=host.indexOf('<details id="discoveryReviewPanel"');
 const end=host.indexOf('</details>',start);
 const section=host.slice(start,end);
 const footer=section.indexOf('class="ba-review-footer"');
 assert.ok(footer>section.indexOf('id="discoveryReviewSuggestions"'));
 const summary=section.slice(0,section.indexOf('</summary>'));
 assert.doesNotMatch(summary,/id="discoveryCopilot"|id="baReviewFinish"|id="discoveryReviewApply"|id="baReviewSkip"/);
 for(const id of ['discoveryCopilot','baReviewFinish','discoveryReviewApply','baReviewSkip','baReviewApplyStop','baReviewRetry']){
  assert.equal((section.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.ok(section.indexOf('id="'+id+'"')>footer,id+' must be in footer');
 }
 assert.match(css,/#discoveryView \.ba-review-details \.ba-review-footer\{/);
 assert.match(ui,/finish.textContent=unresolvedFindings\?'Review & Acknowledge Findings'/);
});

test('release metadata is v0.2.98',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.version,'0.3.49');
 assert.equal(pkg.atgvDisplayVersion,'0.3.49');
 assert.match(host,/atgvDisplayVersion :'0\.3\.49'/);
});
