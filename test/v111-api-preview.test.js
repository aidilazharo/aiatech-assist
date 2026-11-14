'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const simulator=require('../media/api-simulator');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('API simulator returns safe local 200/201/204 examples based on draft response schemas',()=>{
 const get={method:'GET',path:'/projects/{projectId}',responseSchema:{type:'object',properties:{id:{type:'string'},count:{type:'integer'},ready:{type:'boolean'}}}};
 assert.deepEqual(simulator.simulate(get,{params:{projectId:'p 1'}}).body,{id:'example',count:0,ready:false});
 assert.equal(simulator.simulate(get,{params:{projectId:'p 1'}}).requestPath,'/projects/p%201');
 assert.equal(simulator.simulate(get,{params:{projectId:'p 1'}}).status,200);
 assert.equal(simulator.simulate({method:'POST',path:'/projects',responseSchema:{type:'object',properties:{id:{type:'string',example:'demo-id'}}}},{requestText:'{}'}).status,201);
 assert.equal(simulator.simulate({method:'DELETE',path:'/projects/{id}'},{params:{id:'a'}}).status,204);
});
test('API simulator validates required fields, bad JSON, missing paths, size and simulated failures',()=>{
 const endpoint={method:'POST',path:'/projects/{projectId}',requestSchema:{type:'object',required:['name'],properties:{name:{type:'string'},active:{type:'boolean'}}}};
 assert.equal(simulator.simulate(endpoint,{params:{projectId:'p'},requestText:'{bad'}).status,400);
 const bad=simulator.simulate(endpoint,{params:{projectId:'p'},requestText:'{}'});
 assert.equal(bad.status,422);assert.match(bad.body.details.join(' '),/name is required/);
 assert.equal(simulator.simulate(endpoint,{requestText:'{}'}).status,400);
 assert.equal(simulator.simulate(endpoint,{params:{projectId:'p'},requestText:'"x"'}).status,422);
 assert.equal(simulator.simulate(endpoint,{params:{projectId:'p'},requestText:'x'.repeat(25000)}).status,413);
 for(const scenario of ['unauthorized','forbidden','notFound','conflict','validation','server']){
  const result=simulator.simulate(endpoint,{params:{projectId:'p'},requestText:'{"name":"A"}',scenario});
  assert.equal(result.simulated,true);assert.ok(result.status>=400);
 }
});
test('simulator remains strictly offline and does not contain HTTP client APIs or credentials',()=>{
 const source=read('media/api-simulator.js');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|https?:\/\/|require\(['"](?:http|https|net|tls)/);
 assert.deepEqual(simulator.sample({type:'array',items:{type:'number'}}),[0]);
});
test('design preview uses Swagger-inspired, colored, editable API simulation inside ATGV right pane',()=>{
 const source=read('media/start.js'),host=read('test/generated/extension-source.txt'),css=read('media/start.css');
 assert.match(source,/function renderApiDesignPreview\(root,design\)/);
 assert.match(source,/renderApiDesignPreview\(root,design\)/);
 assert.match(source,/api\.simulate\(endpoint,\{params:fields,requestText:editor\?\.value,scenario:scenario\.value\}\)/);
 assert.match(source,/atgv-api-filterbar/);
 assert.match(source,/atgv-api-response-status/);
 assert.match(source,/atgv-api-test-actions/);
 assert.match(host,/api-simulator\.js/);
 assert.match(host,/script src="\$\{apiSimulatorJs\}"/);
 assert.match(css,/\.atgv-api-method-post \.atgv-api-method/);
 assert.match(css,/\.atgv-api-result-failed/);
 assert.match(css,/\.atgv-api-workbench\{display:grid/);
 assert.doesNotMatch(host,/ViewColumn\.Two|editorLayoutTwoColumns/);
});
