'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const htmlSource=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
test('all three BA sections start collapsed, with native keyboard-accessible controls and counters',()=>{
  assert.match(src,/\['Business context',0,4\],\['Requirements and rules',4,8\],\['Delivery and open questions',8,12\]/);
  assert.match(src,/const section=document.createElement\('details'\);section.className='discovery-group'/);
  assert.match(src,/const summary=document.createElement\('summary'\);summary.className='discovery-group-head'/);
  assert.doesNotMatch(src,/section.open\s*=\s*true|setAttribute\('open'/);
  assert.match(src,/refreshDiscoveryGroupCounts\(\)/);
  assert.match(css,/\.discovery-group\[open\]>/);
});
test('version appears only in VS Code extension details, not webview',()=>{
  const pkg=require('../package.json');
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
  assert.equal(pkg.atgvDisplayVersion,pkg.version);
  assert.equal(fs.readFileSync(path.join(root,'README.md'),'utf8').trim(),`**Version: ${pkg.atgvDisplayVersion}**\n\n**Author:** [Muhamad Aidil Azhar Salim](mailto:muhamadaidilazhar.salim@aia.com)`);
  assert.doesNotMatch(htmlSource,/id="headerVersion"|id="gateVersion"|id="version"/);
  assert.doesNotMatch(src,/\$\('headerVersion'\)|\$\('gateVersion'\)|\$\('version'\)/);
});
