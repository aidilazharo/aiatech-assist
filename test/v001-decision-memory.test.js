'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {parts,nextVersion,requireIncrement}=require('../src/version-policy');
const {memoryForPrompt}=require('../src/decision-memory');
const root=path.join(__dirname,'..');
test('release version increments one step with base-100 carry and hard upper bound',()=>{
 assert.equal(nextVersion('0.0.0'),'0.0.1');
 assert.equal(nextVersion('0.0.99'),'0.1.0');
 assert.equal(nextVersion('0.99.99'),'1.0.0');
 assert.equal(nextVersion('99.99.98'),'99.99.99');
 assert.throws(()=>nextVersion('99.99.99'),/Maximum/);
 for(const x of ['100.0.0','0.100.0','0.0.100','00.0.0','0.00.0'])assert.throws(()=>parts(x));
 assert.equal(requireIncrement('0.0.0','0.0.1'),'0.0.1');
 for(const x of ['0.0.0','0.0.2','0.1.0','99.99.99'])assert.throws(()=>requireIncrement('0.0.0',x));
});
test('extension metadata is blank and AI decisions are curated',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.description,'');
 assert.equal(pkg.version,'0.0.3');
 assert.equal(pkg.atgvDisplayVersion,pkg.version);
 const manifestPath=path.join(root,'.memory/manifest.json');
 if(fs.existsSync(manifestPath)){
  const index=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(index.schema,1);assert.equal(index.categories.length,14);
  for(const item of index.categories){assert.match(item.path,/^\.memory\/[a-z][a-z0-9-]*\.json$/);const d=JSON.parse(fs.readFileSync(path.join(root,item.path),'utf8'));assert.equal(d.category,item.id);}
  assert.match(memoryForPrompt('version release increment'),/99\.99\.99/);
  assert.match(memoryForPrompt('extension description details'),/description stays empty/);
  assert.doesNotMatch(memoryForPrompt('weather tomorrow'),/description stays empty/);
 }else{
  assert.equal(fs.existsSync(path.join(root,'.memory')),false);
  assert.equal(memoryForPrompt('version release increment'),'');
 }

 const packager=fs.readFileSync(path.join(root,'scripts/package-vsix.py'),'utf8');
 assert.doesNotMatch(packager,/'design-system', '\.memory'/);
 assert.match(packager,/Release safety policy: \.memory must not be included in VSIX/);
 assert.match(fs.readFileSync(path.join(root,'.gitattributes'),'utf8'),/^\.memory export-ignore$/m);
 const sync=fs.readFileSync(path.join(root,'src/github-sdlc-catalog.js'),'utf8');assert.match(sync,/\.memory/);
});
