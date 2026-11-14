'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const source=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const ui=require('node:fs').readFileSync(path.join(__dirname,'../media/start.js'),'utf8');

test('catalog update controls remain after the Access & Testing Manual is removed',()=>{
 for(const id of ['architectCheckStackUpdates','architectPullStackUpdates'])assert.ok(source.includes(id),id);
 for(const action of ['architectCheckStackUpdates','architectPullStackUpdates']){
  assert.ok(source.includes(`case '${action}'`),`Missing backend ${action}`);
  assert.ok(ui.includes(`'${action}'`),`Missing frontend ${action}`);
 }
 assert.doesNotMatch(source,/Access &amp; Testing Manual|architectGuideItems|architectGuideRefresh/);
 assert.ok(source.includes("confirmation!=='Pull & Update'"),'User confirmation before catalog pull');
 assert.ok(source.includes('sdlcCatalog.syncGitWorkspace'),'stable git pull activation');
});
