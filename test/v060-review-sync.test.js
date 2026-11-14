'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const delivery=require('../src/delivery-work');
const {ProjectMemory}=require('../service/ai/memory');
const br=require('../src/br-workflow');
const {checksum}=require('../src/document-editor');
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-060-'));try{
 const content={title:'Feature testing',objective:'Create a service',scope:'API',acceptanceCriteria:'API returns receipt',features:[]};
 const record={brs:[{id:'BR-001',status:'approved',approvedRevision:1,approvedContent:content}],synced:{'BR-001':{key:'DEV-1',kind:'Epic',issueType:'Epic',title:'Service'}}};
 record.synced['BR-001'].hash=checksum(JSON.stringify(br.flattenApproved(record.brs)[0]));
 const roles=[{id:'custom-test',label:'Specialist',tasks:[{id:'design',label:'Architecture proposal',document:'design/proposal.md'}]}];
 const readiness={handoffs:[{roleId:'custom-test',items:[{brId:'BR-001',brRevision:1,status:'ready',blockers:[]}]}]};
 delivery.activate(root,{projectId:'service',register:record,readiness,roles});const id=delivery.list(root).items[0].id;
 await fn({root,id,record});
}finally{await fs.rm(root,{force:true,recursive:true});}}
test('AI section improvement preserves human text outside selection and rejects duplicates',()=>fixture(async({root,id,record})=>{
 delivery.start(root,id,'author');delivery.save(root,id,'author',{content:'User wrote first line.\nImportant detail.\nUser wrote last line.',revision:0});
 const proposal=delivery.suggestion(root,id,'author',{content:'Improved technical detail.',selection:'Important detail.',sources:['BR-001'],assumptions:[],questions:[]});
 assert.equal(delivery.suggestion(root,id,'author',{content:'Improved technical detail.',selection:'Important detail.',sources:['BR-001'],assumptions:[],questions:[]}).suggestionId,proposal.suggestionId);
 assert.equal(delivery.context(root,id,record).suggestions.length,1);
 delivery.resolveSuggestion(root,id,'author',proposal.suggestionId,'accept');
 const text=delivery.list(root).items[0].content;assert.equal(text,'User wrote first line.\nImproved technical detail.\nUser wrote last line.');
 assert.throws(()=>delivery.resolveSuggestion(root,id,'author',proposal.suggestionId,'accept'),/already handled/);
}));
test('Earlier draft comparison is read-only and preserves revision history across database opens',()=>fixture(async({root,id,record})=>{
 delivery.start(root,id,'author');delivery.save(root,id,'author',{content:'Revision 1',revision:0});delivery.save(root,id,'author',{content:'Revision 2',revision:1});
 assert.deepEqual(delivery.compare(root,id,1),{revision:1,previous:'Revision 1',currentRevision:2,current:'Revision 2'});
 assert.throws(()=>delivery.compare(root,id,3),/earlier/);
 const m=new ProjectMemory(root);assert.equal(m.db.prepare('SELECT count(*) n FROM delivery_revisions').get().n,2);m.close();
}));
test('Approval and completion produce shareable, metadata-only audit decisions',()=>fixture(async({root,id,record})=>{
 delivery.start(root,id,'owner');delivery.save(root,id,'owner',{content:'Actual human-authored design proposal',revision:0});delivery.submit(root,id,'owner',1);
 delivery.review(root,id,'independent-reviewer',{action:'approve',revision:1,remarks:'Accepted after actual review'});
 delivery.complete(root,id,'owner',1);
 const memory=new ProjectMemory(root);const records=memory.decisions();assert.deepEqual(new Set(records.map(x=>x.kind)),new Set(['delivery-review','delivery-completion']));assert.equal(records.every(x=>!JSON.stringify(x.data).includes('human-authored design proposal')),true);memory.close();
}));
test('Hourly background AI document proposals appear in delivery queue without altering status',()=>fixture(async({root,id,record})=>{
 const memory=new ProjectMemory(root);memory.proposal({jobId:'f'.repeat(64),documentId:'custom-test/design',baseDigest:'0'.repeat(64),inputDigest:'1'.repeat(64),content:'Draft proposal',metadata:{roleId:'custom-test',taskId:'design'}});memory.close();
 const item=delivery.list(root).items[0];assert.equal(item.backgroundDraftCount,1);assert.equal(item.status,'ready');
}));
test('Webview supports reviewer inspection, revision comparison and published-JIRA handoff action',async()=>{
 const source=await fs.readFile(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8'),js=await fs.readFile(path.join(__dirname,'..','media/start.js'),'utf8');
 for(const command of ['deliveryInspect','deliveryCompare','deliveryReview','deliveryComplete'])assert.ok(source.includes("case '"+command+"'"));
 for(const id of ['deliveryRoleFilter','deliveryCompare','deliveryComparison','brOpenDelivery'])assert.ok(source.includes('id="'+id+'"'));
 assert.match(js,/isReviewer/);assert.match(js,/deliveryOperationError/);
});
