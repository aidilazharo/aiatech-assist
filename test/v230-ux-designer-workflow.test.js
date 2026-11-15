'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const refs=require('../src/ux-design-references');
const designs=require('../src/ux-ticket-designs');
const tables=require('../media/atgv-datatables');
const ext=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const web=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const css=require('node:fs').readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const tinyPng=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
async function project(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-uxref-'));try{return await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('Design Reference is ticket scoped, survives load and supplies only written image notes to text AI',()=>project(async root=>{
 const item=await refs.save(root,'TC-392','my-reference.png',tinyPng,'Blue header, two-column dashboard','UX designer');
 assert.equal(item.exists,true);assert.equal(item.key,'TC-392');assert.equal(item.mime,'image/png');
 assert.match(item.preview,/^data:image\/png;base64,/);assert.equal(item.notes,'Blue header, two-column dashboard');
 const loaded=await refs.read(root,'TC-392',{includePreview:true});
 assert.equal(loaded.sha256,item.sha256);assert.equal((await refs.read(root,'TC-393')).exists,false);
 assert.match(refs.promptContext(loaded),/Blue header/);
 assert.match(refs.promptContext(loaded),/cannot inspect its visual contents/);
 const prompt=designs.prompt('wireframe',{key:'TC-392',summary:'Dashboard'}, {entries:[]},'AIA QI',refs.promptContext(loaded));
 assert.match(prompt,/two-column dashboard/);
 assert.match(prompt,/UNTRUSTED DATA/);
}));
test('replacing reference retains new checksum and rejects unsafe/unexpected formats',()=>project(async root=>{
 const first=await refs.save(root,'TC-392','reference.md',Buffer.from('# Modern layout\nButtons on right'),'Put actions at bottom');
 assert.match(first.referenceText,/Buttons on right/);
 const newer=await refs.save(root,'TC-392','reference.txt',Buffer.from('Make responsive layout'),'Use compact navigation');
 assert.notEqual(first.sha256,newer.sha256);assert.equal((await refs.read(root,'TC-392')).originalName,'reference.txt');
 await assert.rejects(fs.stat(path.join(root,'documents','jira-designs','TC-392',first.filename)),{code:'ENOENT'});
 assert.throws(()=>refs.verifyBytes('bad.png',Buffer.from('not a PNG')),/valid PNG/);
 assert.throws(()=>refs.verifyBytes('bad.svg',Buffer.from('<svg>')),/Design references must/);
 assert.throws(()=>refs.verifyBytes('bad.txt',Buffer.from([0,4,7])),/binary/);
 await assert.rejects(refs.save(root,'../../escape','bad.txt',Buffer.from('hello')));
}));
test('reference path rejects symbolic links inside the design storage',()=>project(async root=>{
 const folder=path.join(root,'documents','jira-designs','TC-392');await fs.mkdir(path.dirname(folder),{recursive:true});
 await fs.symlink(root,folder);
 await assert.rejects(refs.save(root,'TC-392','valid.txt',Buffer.from('hello')),/Symlink/);
}));
test('assignment pinning puts Mine first while keeping Jira ID sort inside each group',()=>{
 const rows=[{key:'TC-390',mine:false},{key:'TC-393',mine:false},{key:'TC-392',mine:true},{key:'TC-391',mine:true}];
 assert.deepEqual(tables.select(rows,{sortKey:'key',pinFirst:item=>item.mine}).rows.map(x=>x.key),['TC-391','TC-392','TC-390','TC-393']);
 assert.deepEqual(tables.select(rows,{sortKey:'key'}).rows.map(x=>x.key),['TC-390','TC-391','TC-392','TC-393']);
 assert.deepEqual(tables.select(rows,{sortKey:'key',descending:true,pinFirst:item=>item.mine}).rows.map(x=>x.key),['TC-392','TC-391','TC-393','TC-390']);
});
test('six-step UI/UX workflow has one generation action, ticket upload and a review page',()=>{
 for(const id of ['uxUploadReference','uxReferenceInfo','uxReferencePreview','uxSelectedTicket','uxGenerateUIUX','uxDesignPreviewPage','uxFlowDiagram','uxOpenPrototypeBrowser','uxDeveloperHandoff','uxApproveDesign','uxRejectDesign'])assert.match(ext,new RegExp('id="'+id+'"'));
 for(const command of ['uxDesignReferenceRead','uxDesignReferenceUpload','uxPipelineRead','uxPipelineGenerate','uxPipelineDecide'])assert.match(ext,new RegExp("case '"+command+"':"));
 for(const stage of ['User Flow','Wireframe','UI Mockup','Interactive Prototype','Developer Handoff'])assert.match(web,new RegExp(stage));
 assert.doesNotMatch(ext,/id="uxGenerateWireframe"|id="uxGenerateMockup"|id="uxDesignCards"/);
 assert.doesNotMatch(web,/Optional: upload PNG, JPG, WebP, PDF, Markdown or text/);
 assert.match(web,/open.textContent='Open Design'/);assert.match(web,/openUxDesignForIssue\(item.key\)/);
 assert.match(web,/pinFirst:selectedRole==='ux-designer'/);
 assert.match(web,/send\('uxDesignReferenceUpload'/);
 assert.match(css,/max-width:520px;height:38px/);
});
test('version is 0.2.42',()=>{const pkg=require('../package.json');assert.equal(pkg.version,'0.3.52');assert.equal(pkg.atgvDisplayVersion,'0.3.52');});
