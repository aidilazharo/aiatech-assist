'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const helper = require('../src/stack-dependency-helper');

async function scenario(exportSource, fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'atgv-270-libsql-'));
  try {
    const moduleDir=path.join(root,'node_modules/libsql');
    await fs.mkdir(moduleDir,{recursive:true});
    await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'atgv-sql-smoke-test',version:'1.0.0',dependencies:{libsql:'^0.5.0'}}));
    await fs.writeFile(path.join(moduleDir,'package.json'),JSON.stringify({name:'libsql',main:'index.js'}));
    await fs.writeFile(path.join(moduleDir,'index.js'),exportSource);
    const nativeDir=path.join(root,'node_modules',...('@libsql/'+helper.nativeTriple()).split('/'));
    await fs.mkdir(nativeDir,{recursive:true});
    await fs.writeFile(path.join(nativeDir,'package.json'),JSON.stringify({name:'fixture-native'}));
    return await fn(root);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
}
const constructor = "class Database {constructor(filename){ if(filename!==':memory:') throw Error('wrong database'); }prepare(sql){if(sql!=='SELECT 1 AS ok') throw Error('wrong statement');return {get(){return {ok:1}}}} close(){}}";
test('libSQL native smoke probe accepts the documented CommonJS default constructor using a real Node process',async()=>{
  await scenario(constructor+';module.exports=Database;',async cwd=>{
    const result=await helper.verifyPlatformPackages(cwd);
    assert.equal(result.libsql,'@libsql/'+helper.nativeTriple());
  });
});
test('libSQL smoke probe accepts ES-module interop default property, never assumes a named Database export',async()=>{
  await scenario(constructor+';module.exports={default:Database};',async cwd=>{
    const result=await helper.verifyPlatformPackages(cwd);
    assert.equal(result.libsql,'@libsql/'+helper.nativeTriple());
  });
});
test('libSQL smoke probe still rejects a broken SQL operation and reports its diagnostic',async()=>{
  await scenario("module.exports=class Database{prepare(){return {get(){return {ok:0}}}}close(){}};",async cwd=>{
    const records=[];
    await assert.rejects(helper.verifyPlatformPackages(cwd,{onDiagnostic:r=>records.push(r)}),/libSQL native binary smoke check failed/);
    assert.ok(records.length);
  });
});
test('Developer nine-stage progress grid is contained and responds to narrow card widths',async()=>{
 const css=await fs.readFile(path.join(__dirname,'../media/start.css'),'utf8');
 const host=await fs.readFile(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 const steps=host.match(/id="developerBrStep(?:Analyze|Plan|Red|Green|Refactor|Test|Build|Local|Verify)"/g)||[];
 assert.equal(steps.length,9);
 assert.match(css,/v0\.2\.71:[\s\S]*grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/);
 assert.match(css,/v0\.2\.71:[\s\S]*--atgv-tdd-circle:clamp\(17px, 3\.1cqw, 37px\)/);
 assert.match(css,/v0\.2\.71:[\s\S]*grid-auto-flow:column/);
 assert.match(css,/v0\.2\.71:[\s\S]*width:calc\(100% - var\(--atgv-tdd-circle\)\)/);
 assert.match(css,/\.developer-br-workspace\{container-type:inline-size\}/);
});
