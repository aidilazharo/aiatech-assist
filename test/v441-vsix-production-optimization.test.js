'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
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

test('v441: minified VSIX remains subject to measured size limit, dependency check and activation verification',()=>{
 const pack=fs.readFileSync(path.join(root,'scripts','package-vsix.py'),'utf8');
 const build=fs.readFileSync(path.join(root,'scripts','build-vsix.js'),'utf8');
 const workflow=fs.readFileSync(path.join(root,'.github','workflows','build-release-vsix.yml'),'utf8');
 const config=JSON.parse(fs.readFileSync(path.join(root,'scripts','vsix-size-budget.json'),'utf8'));
 assert.equal(config.baselineVersion,'0.4.40');
 assert.equal(config.baselineBytes,1327153);
 assert.ok(config.maxCompressedBytes>=config.baselineBytes);
 assert.match(pack,/optimize-vsix-assets\.js/);
 assert.match(pack,/VSIX missing local dependency/);
 assert.match(pack,/vsix-size-report\.json/);
 assert.match(pack,/zippedBytes>limit/);
 assert.match(build,/verify-vsix\.js/);
 assert.match(workflow,/vsix-size-report\.json/);
 assert.match(workflow,/Publish release for this main commit/);
});
