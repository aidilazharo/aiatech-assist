'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8'),ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8'),css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
test('unified AI proposals require explicit full-draft review before a separate approval or apply action',()=>{
 assert.match(host,/case 'unifiedProposalPreview'/);
 assert.match(host,/const isOwner=handoffs\.some/);
 assert.match(host,/if\(!isOwner&&!reviewer\)throw Error/);
 assert.match(ui,/textContent='View Full Draft'/);
 assert.match(ui,/send\('unifiedProposalPreview',\{proposalId:p\.id\}\)/);
 assert.match(ui,/node\.textContent='Baseline digest: '/);
 assert.match(css,/\.unified-proposal-preview/);
});
