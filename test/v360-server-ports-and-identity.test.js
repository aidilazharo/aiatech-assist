'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bootstrap=require('../src/architect-stack-bootstrap');
test('frontend and API collisions select distinct available ports',async()=>{
 const occupied=new Set([5173,3001]);
 const chosen=await bootstrap.chooseAvailableRuntimePorts('http://127.0.0.1:5173/','http://127.0.0.1:3001/',{
  portAvailable:async url=>!occupied.has(Number(new URL(url).port))
 });
 assert.equal(chosen.url,'http://127.0.0.1:5174/');
 assert.equal(chosen.apiPort,3002);
 assert.equal(chosen.apiUrl,'http://127.0.0.1:3002/');
});
test('frontend and API never share a selected port',async()=>{
 const chosen=await bootstrap.chooseAvailableRuntimePorts('http://127.0.0.1:5173/','http://127.0.0.1:5173/',{
  portAvailable:async()=>true
 });
 assert.equal(chosen.url,'http://127.0.0.1:5173/');
 assert.equal(chosen.apiPort,5174);
});
test('Vite HTTP 200 does not prove API process identity',async()=>{
 const http=require('node:http');
 const listener=http.createServer((req,res)=>{
  if(req.url==='/api/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'ok',database:'sqlite',instanceId:'other'}));return;}
  res.writeHead(200);res.end('vite');
 });
 await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+listener.address().port+'/';
  await assert.rejects(bootstrap.waitForHttp(url,()=>true,1200,'expected'),/identity mismatch/i);
 }finally{await new Promise(resolve=>listener.close(resolve));}
});
