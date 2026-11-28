'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {python}=require('../scripts/python-runtime');
const root=path.resolve(__dirname,'..');

test('v441: production minifier stages smaller JS/CSS while preserving original source files',async t=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-vsix-minifier-'));
 t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
 const originalJs=await fsp.readFile(path.join(root,'media','start.js'),'utf8');
 const originalCss=await fsp.readFile(path.join(root,'media','start.css'),'utf8');
 const result=spawnSync(process.execPath,[path.join(root,'scripts','optimize-vsix-assets.js'),dir],{
  cwd:root,encoding:'utf8',timeout:180000,maxBuffer:1024*1024
 });
 assert.equal(result.status,0,result.stderr||result.stdout);
 const manifest=JSON.parse(await fsp.readFile(path.join(dir,'optimization-manifest.json'),'utf8'));
 assert.equal(manifest.schema,1);
 assert.ok(manifest.files.length>0);
 assert.ok(manifest.files.every(f=>f.originalBytes>f.optimizedBytes&&f.savedBytes>0));
 const ui=await fsp.readFile(path.join(dir,'media','start.js'),'utf8');
 const css=await fsp.readFile(path.join(dir,'media','start.css'),'utf8');
 assert.ok(ui.length<originalJs.length);
 assert.ok(css.length<originalCss.length);
 assert.equal(await fsp.readFile(path.join(root,'media','start.js'),'utf8'),originalJs);
 assert.equal(await fsp.readFile(path.join(root,'media','start.css'),'utf8'),originalCss);
 assert.doesNotThrow(()=>new vm.Script(ui,{filename:'start.optimized.js'}));
});

test('v441: minified VSIX retains advisory size reporting, dependency check and activation verification',()=>{
 const pack=fs.readFileSync(path.join(root,'scripts','package-vsix.py'),'utf8');
 const build=fs.readFileSync(path.join(root,'scripts','build-vsix.js'),'utf8');
 const workflow=fs.readFileSync(path.join(root,'.github','workflows','build-release-vsix.yml'),'utf8');
 const config=JSON.parse(fs.readFileSync(path.join(root,'scripts','vsix-size-budget.json'),'utf8'));
 assert.equal(config.baselineVersion,'0.4.40');
 assert.equal(config.baselineBytes,1327153);
 assert.ok(config.advisoryCompressedBytes>=config.baselineBytes);
 assert.equal(Object.hasOwn(config,'maxCompressedBytes'),false);
 assert.match(pack,/optimize-vsix-assets\.js/);
 assert.match(pack,/VSIX missing local dependency/);
 assert.match(pack,/vsix-size-report\.json/);
 assert.match(pack,/sizeBudgetEnforced':False/);
 assert.match(pack,/aboveAdvisoryTarget/);
 assert.doesNotMatch(pack,/raise SystemExit\([^\n]*size budget/);
 assert.match(build,/verify-vsix\.js/);
 assert.match(workflow,/vsix-size-report\.json/);
 assert.match(workflow,/Publish release for this main commit/);
});

test('v441: oversized valid VSIX is packaged, audited and still passes archive integrity',async t=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv-vsix-advisory-'));
 t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
 const fixture=path.join(dir,'source');
 for(const name of ['scripts','assets','service'])await fsp.mkdir(path.join(fixture,name),{recursive:true});
 const config=JSON.parse(await fsp.readFile(path.join(root,'scripts','vsix-size-budget.json'),'utf8'));
 await fsp.copyFile(path.join(root,'scripts','package-vsix.py'),path.join(fixture,'scripts','package-vsix.py'));
 await fsp.copyFile(path.join(root,'scripts','vsix-size-budget.json'),path.join(fixture,'scripts','vsix-size-budget.json'));
 // Exercise standard ZIP compression even on hosts with optional Zopfli installed.
 await fsp.writeFile(path.join(fixture,'scripts','zopfli.py'),"raise ImportError('optional optimizer disabled for fixture')\n");
 await fsp.writeFile(path.join(fixture,'scripts','optimize-vsix-assets.js'),"require('node:fs').writeFileSync(require('node:path').join(process.argv[2],'optimization-manifest.json'),JSON.stringify({files:[]}));\n");
 await fsp.writeFile(path.join(fixture,'package.json'),JSON.stringify({name:'advisory-fixture',publisher:'atgv',version:'0.0.1',atgvDisplayVersion:'0.0.1',displayName:'Fixture',description:'Test fixture',engines:{vscode:'^1.94.0'}}));
 await fsp.writeFile(path.join(fixture,'README.md'),'Fixture');
 await fsp.writeFile(path.join(fixture,'service','server.js'),'');
 await fsp.writeFile(path.join(fixture,'scripts','create-service-user.js'),'');
 await fsp.writeFile(path.join(fixture,'assets','payload.bin'),randomBytes(1600000));
 const run=python([path.join(fixture,'scripts','package-vsix.py')],{cwd:fixture,encoding:'utf8',timeout:180000});
 assert.equal(run.status,0,run.stderr||run.stdout);
 const archive=path.join(dir,'advisory-fixture-0.0.1.vsix');
 const report=JSON.parse(await fsp.readFile(path.join(fixture,'dist','vsix-size-report.json'),'utf8'));
 assert.ok(report.vsixBytes>config.advisoryCompressedBytes);
 assert.equal(report.vsixBytes,(await fsp.stat(archive)).size);
 assert.equal(report.sizeBudgetEnforced,false);
 assert.equal(report.aboveAdvisoryTarget,true);
 assert.match(run.stdout,/VSIX size advisory/);
 const integrity=python(['-c',"import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert 'extension/package.json' in z.namelist()",archive],{encoding:'utf8'});
 assert.equal(integrity.status,0,integrity.stderr);
 // The same oversized fixture must still fail when a required local dependency is missing.
 await fsp.writeFile(path.join(fixture,'service','server.js'),"require('./missing');");
 const rejected=python([path.join(fixture,'scripts','package-vsix.py')],{cwd:fixture,encoding:'utf8',timeout:180000});
 assert.notEqual(rejected.status,0);
 assert.match(rejected.stderr,/VSIX missing local dependency/);
});
