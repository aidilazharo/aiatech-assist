'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {display,actionLabel}=require('../media/ownership-presentation');
const ui=fs.readFileSync(path.join(__dirname,'..','media','start.js'),'utf8');
const extension=fs.readFileSync(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
test('current owner sees one clear state and no unnecessary ownership button',()=>{
 const view=display({ownerId:'user-1',ownerName:'Alex',revision:2},'user-1');
 assert.equal(view.text,'You own this document');
 assert.equal(view.state,'mine');
 assert.equal(view.primary,null);
 assert.equal(view.secondary,null);
});
test('incoming transfer displays requester name and both owner decisions',()=>{
 const view=display({ownerId:'user-1',ownerName:'Alex',pending:{from:'user-1',to:'user-2',toName:'Taylor Lee'}},'user-1');
 assert.equal(view.text,'Taylor Lee requested ownership transfer');
 assert.equal(view.primary,'approve-transfer');
 assert.equal(view.secondary,'reject-transfer');
 assert.equal(actionLabel(view.primary),'Approve Transfer');
});
test('requester can cancel but cannot approve or reject their own transfer',()=>{
 const view=display({ownerId:'user-1',ownerName:'Alex',pending:{from:'user-1',to:'user-2',toName:'Taylor Lee'}},'user-2');
 assert.equal(view.text,'You requested ownership transfer from Alex');
 assert.equal(view.primary,'cancel-transfer');
 assert.equal(view.secondary,null);
});
test('another user sees a pending request without actionable transfer buttons',()=>{
 const view=display({ownerId:'user-1',ownerName:'Alex',pending:{from:'user-1',to:'user-2',toName:'Taylor Lee'}},'user-3');
 assert.match(view.text,/Taylor Lee requested ownership transfer/);
 assert.equal(view.primary,null);
 assert.equal(view.secondary,null);
});
test('unowned and owned-by-other statuses preserve original actions',()=>{
 assert.equal(display({ownerId:null},'user-2').primary,'claim');
 const other=display({ownerId:'user-1',ownerName:'Alex'},'user-2');
 assert.equal(other.text,'Owned by Alex');
 assert.equal(other.primary,'request-transfer');
});
test('cached ownership is labeled and missing account names fall back to account ID',()=>{
 const view=display({ownerId:'user-1',pending:{from:'user-1',to:'user-2'}},'user-1',{cached:true});
 assert.match(view.text,/user-2 requested ownership transfer/);
 assert.match(view.text,/Cached; changes require synchronization/);
});
test('all ownership surfaces use the same shared presentation rules',()=>{
 for(const fragment of ['renderHandoffs(){','updateDocumentOwnership(){','baOwnershipLabel(documentId){','renderBAOwner(){','renderBRs(){','renderOwnershipTable(){','showOwnerStatus(){']){
  assert.ok(ui.includes(fragment),fragment);
 }
 assert.match(ui,/const presentation=ATGVOwnershipPresentation\.display\(record,me/);
 assert.match(ui,/const presentation=ATGVOwnershipPresentation\.display\(owner,documentOwnerMe/);
 assert.match(ui,/ATGVOwnershipPresentation\.display\(record,baOwnerState\?\.me/);
 assert.match(ui,/const ownershipDisplay=ATGVOwnershipPresentation\.display\(ownership/);
 assert.match(ui,/const presentation=ATGVOwnershipPresentation\.display\(o,me/);
 assert.match(extension,/const ownershipPresentation=webview\.asWebviewUri/);
 assert.match(extension,/ownership-presentation\.js/);
});
test('document editor routes pending transfer decisions through existing authorization',()=>{
 assert.match(extension,/\['claim','request-transfer','approve-transfer','reject-transfer','cancel-transfer'\]/);
 assert.match(ui,/id='reject-transfer'/u.test(ui)?/reject-transfer/:/action:'reject-transfer'/);
 assert.match(extension,/me:state\.me,meName:state\.meName,cached:!!state\.cached/);
});
