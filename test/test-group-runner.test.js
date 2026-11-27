'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {groups,classify,inventory,audit,summary}=require('../scripts/run-test-groups');
test('group inventory covers every existing test file exactly once',()=>{
 const dir=__dirname,expected=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isFile()&&x.name.endsWith('.test.js')).map(x=>x.name).sort();
 const actual=Object.values(inventory(dir)).flat().sort();
 assert.deepEqual(actual,expected);
 assert.equal(new Set(actual).size,actual.length);
});
test('primary groups classify known files deterministically and retain new regressions',()=>{
 for(const [file,group] of [['extension.test.js','smoke'],['core.test.js','unit'],['v067-ui-consistency.test.js','ui'],['remote-api.test.js','integration'],['v036-security-regression.test.js','security'],['v058-e2e-audit.test.js','e2e'],['v054-integrity-stress.test.js','performance'],['v147-windows-pdf.test.js','platform'],['v146-mapping-recovery.test.js','recovery'],['new-feature.test.js','regression']]){
  assert.equal(classify(file),group,file);assert.ok(Object.hasOwn(groups,group));
 }
});
test('audit identifies duplicate sources and repeated titles without changing files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-audit-test-'));
 try{
  const source="test('same name',()=>{});\n";
  fs.writeFileSync(path.join(dir,'a.test.js'),source);
  fs.writeFileSync(path.join(dir,'b.test.js'),source);
  fs.writeFileSync(path.join(dir,'c.test.js'),"test('same name',()=>{throw Error('different');});");
  const result=audit(dir);
  assert.deepEqual(result.duplicateFiles,[['a.test.js','b.test.js']]);
  assert.equal(result.repeatedTitles[0][1].length,3);
  assert.equal(fs.readFileSync(path.join(dir,'a.test.js'),'utf8'),source);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('TAP summaries expose failures and incomplete runner output',()=>{
 assert.deepEqual(summary('# tests 4\n# pass 2\n# fail 1\n# cancelled 0\n# skipped 1\n# todo 0\n'),{tests:4,pass:2,fail:1,cancelled:0,skipped:1,todo:0});
 assert.equal(summary('crashed').tests,null);
});
