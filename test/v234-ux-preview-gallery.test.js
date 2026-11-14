'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const refs=require('../src/ux-design-references');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const js=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const css=require('node:fs').readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
async function sandbox(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-v234-'));try{return await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('up to ten images are persisted per Jira ticket, previewed independently and removed safely',()=>sandbox(async root=>{
 const hashes=new Set(),files=[];
 for(let i=0;i<10;i++){
  const b=Buffer.concat([png,Buffer.from([i+1])]);
  const saved=await refs.addImage(root,'TC-392','shot'+i+'.png',b,'A clean form '+i,'Designer');
  assert.equal(saved.images.length,i+1);assert.equal(saved.imageCount,i+1);assert.match(saved.images[i].preview,/^data:image\/png;base64,/);
  hashes.add(saved.sha256);files.push(saved.images[i].id);
 }
 assert.equal(hashes.size,10);
 assert.equal((await refs.readBundle(root,'TC-393')).exists,false);
 await assert.rejects(refs.addImage(root,'TC-392','eleventh.png',Buffer.concat([png,Buffer.from([30])])),/Maximum ten/);
 const before=await refs.readBundle(root,'TC-392');
 const after=await refs.deleteImage(root,'TC-392',files[1]);
 assert.equal(after.images.length,9);assert.notEqual(before.sha256,after.sha256);
 assert.equal((await refs.readBundle(root,'TC-392',{includePreview:false})).images.every(v=>!v.preview),true);
 const ref=await refs.addImage(root,'TC-392','new.png',Buffer.concat([png,Buffer.from([30])]));
 assert.equal(ref.imageCount,10);assert.match(refs.promptContext(ref),/HUMAN REVIEW/);
 assert.doesNotMatch(refs.promptContext(ref),/base64/);
 await assert.rejects(refs.deleteImage(root,'TC-392','../../../../etc/passwd'),/Invalid design image identifier/);
}));
test('legacy single reference image counts toward limit and remains deletable',()=>sandbox(async root=>{
 await refs.save(root,'TC-392','legacy.png',png,'Old reference');
 let current=await refs.readBundle(root,'TC-392',{includePreview:true});
 assert.equal(current.imageCount,1);assert.equal(current.images[0].id,'legacy');
 for(let i=0;i<9;i++)current=await refs.addImage(root,'TC-392','image'+i+'.png',Buffer.concat([png,Buffer.from([i+11])]));
 assert.equal(current.imageCount,10);
 await assert.rejects(refs.addImage(root,'TC-392','extra.png',Buffer.concat([png,Buffer.from([80])])),/Maximum ten/);
 const remaining=await refs.deleteImage(root,'TC-392','legacy');
 assert.equal(remaining.imageCount,9);assert.equal((await refs.read(root,'TC-392')).exists,false);
}));
test('new designer preview includes draggable zoomable flow, Jira title and external prototype action',()=>{
 const page=host.slice(host.indexOf('<main id="uxPreviewView"'),host.indexOf('<main id="documentsView"'));
 const workspace=host.slice(host.indexOf('<section id="uxDesignWorkspace"'),host.indexOf('<section id="roleJiraWork"'));
 assert.match(js,/Jira '\+uxSelectedKey\+' - UI\/UX Design Preview/);
 assert.doesNotMatch(page,/Review the generated user journey|Awaiting human review\. No developer handoff/);
 assert.doesNotMatch(page,/<summary>Interactive Prototype<\/summary>/);
 assert.ok(page.indexOf('id="uxOpenPrototypeBrowser"')>page.indexOf('id="uxRejectDesign"'));
 assert.match(css,/\.ux-preview-prototype-launch\{margin-left:auto/);
 for(const item of ['pointerdown','pointermove','setPointerCapture','Zoom out user flow','Zoom in user flow','Fit diagram to available width'])assert.match(js,new RegExp(item));
 assert.ok(workspace.indexOf('id="uxDesignVersionInfo"')<workspace.indexOf('id="uxSelectedTicket"'));
 assert.ok(workspace.indexOf('id="uxSelectedTicket"')<workspace.indexOf('id="uxUploadReference"'));
 assert.match(host,/case 'uxDesignReferenceDelete':/);
 assert.match(js,/send\('uxDesignReferenceDelete'/);
 assert.match(css,/\.ux-reference-delete/);
});

test('Jira Issues My Work header omits redundant assignment paragraph while preserving controls',()=>{
 const start=host.indexOf('<section id="roleJiraWork"');
 const end=host.indexOf('</section>',start);
 assert.ok(start>=0&&end>start);
 const section=host.slice(start,end);
 assert.match(section,/Jira Issues · My Work/);
 assert.match(section,/id="roleJiraRefresh"/);
 assert.match(section,/id="roleJiraTable"/);
 assert.doesNotMatch(section,/Live project issues assigned to you or unassigned/);
});
