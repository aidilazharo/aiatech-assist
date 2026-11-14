'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {ProjectRegistry}=require('../src/projects');
const {fromDrawioXml,toDrawioXml,normalizeModel}=require('../src/diagram-model');
const {readDiagram,saveDiagramModel}=require('../src/planning');
const {DRAWIO_START}=require('../src/planning');
const model={title:'Architecture',nodes:[{id:'ui',label:'UI & API',x:20,y:25},{id:'api',label:'Backend <service>',x:280,y:25}],edges:[{id:'e1',from:'ui',to:'api',label:'HTTPS'}]};
test('lightweight drawio serializer round trips nodes, arrows, and escaped labels',()=>{
 const xml=toDrawioXml(model);assert.match(xml,/&amp;/);assert.match(xml,/&lt;service&gt;/);
 const parsed=fromDrawioXml(xml);assert.equal(parsed.nodes.length,2);assert.equal(parsed.edges[0].from,'ui');assert.equal(parsed.nodes[0].label,'UI & API');
});
test('unsupported compressed, multi-page, grouped and advanced diagrams are refused',()=>{
 for(const xml of [
  '<mxfile><diagram>base64content</diagram></mxfile>',
  DRAWIO_START.replace('</mxfile>','<diagram id="two" name="Second"></diagram></mxfile>'),
  toDrawioXml(model).replace('parent="1"','parent="someGroup"'),
  toDrawioXml(model).replace('rounded=1;','shape=mxgraph.aws4.cloud;rounded=1;'),
  toDrawioXml(model).replace('<mxCell id="ui"','<object title="nested"></object><mxCell id="ui"')
 ])assert.throws(()=>fromDrawioXml(xml),/unsupported|require|Grouped|Advanced|Compressed|multi-page|Multi-page|custom/i);
});
test('untrusted model IDs, impossible edges and duplicate IDs cannot be saved',()=>{
 assert.throws(()=>normalizeModel({nodes:[{id:'../bad'}],edges:[]}),/identifier/);
 assert.throws(()=>normalizeModel({nodes:[{id:'a'}],edges:[{from:'a',to:'missing'}]}),/unknown endpoint/);
 assert.throws(()=>normalizeModel({nodes:[{id:'a'}],edges:[{id:'a',from:'a',to:'a'}]}),/Duplicate/);
});
test('project diagram persistence is atomic, detects races, refuses unsupported formats',async()=>{
 const ws=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-diagram-'));
 try{
  const registry=new ProjectRegistry(ws);await registry.create({id:'demo',name:'Demo'});
  const before=await readDiagram(registry,'demo');assert.equal(before.editable,true);
  const saved=await saveDiagramModel(registry,'demo',model,before.revision);assert.match(saved.revision,/^[a-f0-9]{64}$/);
  const after=await readDiagram(registry,'demo');assert.equal(after.model.nodes.length,2);
  await assert.rejects(saveDiagramModel(registry,'demo',model,before.revision),/changed on disk/);
  const file=path.join(ws,'projects','demo','documents','architecture','system-diagram.drawio');
  const unsafe='<mxfile><diagram>compressed-diagram</diagram></mxfile>';
  await fs.writeFile(file,unsafe);
  const unsupported=await readDiagram(registry,'demo');assert.equal(unsupported.editable,false);assert.match(unsupported.error,/Compressed/);
  await assert.rejects(saveDiagramModel(registry,'demo',model,unsupported.revision),/Compressed/);
  assert.equal(await fs.readFile(file,'utf8'),unsafe);
 }finally{await fs.rm(ws,{recursive:true,force:true});}
});
test('webview uses local SVG editing and does not load iframe editor or remote scripts',()=>{
 const root=path.join(__dirname,'..');
 const host=require('node:fs').readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
 const client=require('node:fs').readFileSync(path.join(root,'media/start.js'),'utf8');
 assert.match(host,/diagram-canvas\.js/);assert.doesNotMatch(host,/drawioFrame|drawioIndex|<iframe/);
 assert.match(client,/new window\.AtgvDiagramCanvas/);assert.doesNotMatch(client,/drawioFrame|postMessage\(JSON\.stringify\(\{action:'load'/);
});
