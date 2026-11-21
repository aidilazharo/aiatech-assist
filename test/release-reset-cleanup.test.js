'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('reset version and one mutable release note, with no numbered duplicates',()=>{
 const pkg=require('../package.json');
 assert.match(pkg.version,/^[0-9]+\.[0-9]+\.[0-9]+$/);
 assert.equal(pkg.atgvDisplayVersion,pkg.version);
 const names=fs.readdirSync(root).filter(name=>/^RELEASE(?:[_-].+)?\.md$/i.test(name));
 assert.deepEqual(names,['RELEASE.md']);
 assert.ok(fs.readFileSync(path.join(root,'RELEASE.md'),'utf8').includes('ATGV AIATECH Assist v'+pkg.version));
});
