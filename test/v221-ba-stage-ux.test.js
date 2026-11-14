'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const js=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');

test('new business requirement is only shown on Start step',()=>{
 assert.match(js,/\$\('baNewRequirement'\)\.classList\.toggle\('hidden',displayed!=='start'\)/);
 assert.match(js,/\$\('baNewRequirement'\)\.disabled=displayed!=='start'\|\|!activeId\|\|!brState/);
 assert.match(css,/#discoveryView #baNewRequirement\.hidden\{display:none!important\}/);
});
test('archived source UI is absent, but immutable archive support remains',()=>{
 assert.doesNotMatch(js,/Archived & superseded documents/);
 assert.match(js,/function renderArchivedSources\(\)\{/);
 assert.match(js,/root\.replaceChildren\(\);root\.classList\.add\('hidden'\)/);
 assert.match(host,/case 'restoreDiscoverySource'/);
});
test('reopen shortcuts removed and BR history / proposal remain intact',()=>{
 assert.doesNotMatch(host,/id="baEditDiscovery"|id="baReviewDocuments"/);
 assert.doesNotMatch(js,/\$\('baEditDiscovery'\)|\$\('baReviewDocuments'\)/);
 assert.match(host,/id="baOpenChangeProposal"/);
 assert.match(host,/id="baCompletedJiraHistory"/);
});
test('submit transitions to next mapping action only after mapping completes',()=>{
 assert.match(js,/const complete=baMappingComplete\(\)/);
 assert.match(js,/button\.dataset\.action=complete\?'next'/);
 assert.match(js,/Next Step · Map & Save 12/);
 assert.match(js,/button\.disabled=processing\|\|!selectable/);
 assert.match(js,/if\(\$\('sourceProcessSubmit'\)\.dataset\.action==='next'\)\{\s*openBAWorkflowStep\('mapping'\);return;/);
 assert.match(js,/send\('processDiscoverySources',\{digests:\[\.\.\.sourceSelectedDigests\]/);
});
test('steps 2 and 3 footers are suppressed and typography has a consistent scale',()=>{
 assert.match(js,/navigation\.classList\.toggle\('hidden',displayed==='start'\)/);
 assert.match(js,/const previousDefinition=nextIndex>0\?progress\[nextIndex-1\]:null/);assert.doesNotMatch(js,/start:\$\('baStartNextActions'\)/);
 assert.match(css,/#discoveryView\{--ba-font-body:12px;--ba-font-heading:14px;--ba-spacing:16px\}/);
 assert.match(css,/#discoveryView \.source-document-row\{padding:13px 16px/);
});
