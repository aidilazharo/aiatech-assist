'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
test('source-only memory is committed and export-ignore applies to its directory',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(root,'.memory/release-management.json'),'utf8'));
 assert.ok(data.decisions.some(x=>x.id==='RELEASE-0002'&&x.status==='accepted'));
 assert.match(fs.readFileSync(path.join(root,'.gitattributes'),'utf8'),/^\.memory export-ignore$/m);
 const attr=execFileSync('git',['check-attr','export-ignore','--','.memory'],{cwd:root,encoding:'utf8'});
 assert.match(attr,/export-ignore: set/);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.description,'');assert.equal(pkg.version,'0.0.2');
});
