'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('version and author are recorded in the extension details and metadata',()=>{
 const pkg=require('../package.json');
 assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
 assert.equal(pkg.atgvDisplayVersion,pkg.version.split('.').map((n,i)=>i===2?String(Number(n)).padStart(2,'0'):n).join('.'));
 assert.deepEqual(pkg.author,{name:'Muhamad Aidil Azhar Salim',email:'muhamadaidilazhar.salim@aia.com'});
 assert.equal(fs.readFileSync(path.join(root,'README.md'),'utf8').trim(),
  `**Version: ${pkg.atgvDisplayVersion}**\n\n**Author:** [Muhamad Aidil Azhar Salim](mailto:muhamadaidilazhar.salim@aia.com)`);
});
