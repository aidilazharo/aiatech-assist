'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const stack=require('../src/architect-stack-bootstrap');
const developer=require('../src/developer-git');

test('preferred preview port is retained when free; occupied port selects the next free localhost address',async()=>{
 const preferred='http://127.0.0.1:5173/';
 const free=await stack.chooseAvailablePreviewUrl(preferred,{portAvailable:async()=>true});
 assert.equal(free.url,preferred);assert.equal(free.changed,false);
 const visited=[];
 const fallback=await stack.chooseAvailablePreviewUrl(preferred,{portAvailable:async url=>{visited.push(url);return url==='http://127.0.0.1:5174/';}});
 assert.equal(fallback.url,'http://127.0.0.1:5174/');
 assert.equal(fallback.changed,true);
 assert.equal(fallback.previousPort,5173);
 assert.deepEqual(visited,[preferred,fallback.url]);
});
test('when nearby ports are busy, port selection asks the OS and preserves the HTTP path',async()=>{
 const value=await stack.chooseAvailablePreviewUrl('http://127.0.0.1:3000/api/health',{
  scanLimit:2,portAvailable:async url=>url==='http://127.0.0.1:61050/api/health',
  allocatePort:async()=>61050
 });
 assert.equal(value.url,'http://127.0.0.1:61050/api/health');
 assert.equal(value.changed,true);
});
test('all occupied candidates report a clear failure, never take over a port',async()=>{
 await assert.rejects(stack.chooseAvailablePreviewUrl('http://127.0.0.1:5173/',{
  scanLimit:1,portAvailable:async()=>false,allocatePort:async()=>62000
 }),/No available localhost port/);
 for(const url of ['https://external.example:5173/','http://host.example:5173/','http://user:pass@127.0.0.1:5173/']){
  await assert.rejects(stack.chooseAvailablePreviewUrl(url),/localhost HTTP URL/);
 }
});
test('React and Angular fixed-port catalog launchers receive runtime port override without editing package.json',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-alt-port-'));
 try{
  for(const [name,front,oldPort] of [['react','vite','5173'],['angular','ng serve','4200']]){
   const original='concurrently -k "'+front+' --host 127.0.0.1 --port '+oldPort+'" "node server/index.mjs"';
   const packageJson=JSON.stringify({scripts:{dev:original}});
   await fs.writeFile(path.join(folder,'package.json'),packageJson);
   const out=await developer.previewCommand({bin:'npm',args:['run','dev']},{kind:'npm',scripts:['dev']},folder,'http://127.0.0.1:51001/');
   assert.ok(out.args.includes('concurrently'),name);
   assert.ok(out.args.some(arg=>arg.includes('--port 51001')),name);
   assert.ok(out.args.some(arg=>arg==='node server/index.mjs'),name);
   assert.equal(await fs.readFile(path.join(folder,'package.json'),'utf8'),packageJson);
  }
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('Technology Stack exposes the actual selected address and keeps the server verified by that URL',async()=>{
 const html=await fs.readFile(path.join(__dirname,'../src/lib/webview/dashboard-html.js'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const server=await fs.readFile(path.join(__dirname,'../src/architect-server.js'),'utf8');
 assert.match(html,/id="architectServerAddress"/);
 assert.match(ui,/Preview address:/);
 assert.match(server,/previewUrls\.set/);
 assert.match(server,/previewUrl:url/);
 assert.match(server,/url,healthy:true/);
});
