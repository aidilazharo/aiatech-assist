'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
test('process-question notifications do not use a dismiss timer',()=>{
 assert.match(js,/if\(!item\.consentRequestId&&!item\.persistent\)topNoticeTimer=setTimeout\(closeTopNotification/);
 assert.match(js,/const requiresAnswer=\/\\\?\\s\*\$\/\.test\(content\)/);
 assert.match(js,/item=\{message:content,error,success,persistent:!!\(persistent\|\|requiresAnswer\)/);
});
test('Business Requirements restart message is transient and dismissed when the workflow advances',()=>{
 assert.match(js,/status\(m\.freshStart\?'New Business Requirements cycle ready\./);
 assert.match(js,/function dismissObsoleteBARestartNotice\(\)/);
 assert.match(js,/if\(m\.task&&m\.task!=='upload'\)dismissObsoleteBARestartNotice\(\)/);
 assert.match(js,/\$\('topNotificationDismiss'\)\.addEventListener\('click',closeTopNotification\)/);
 assert.match(js,/function closeTopNotification\(\)/);
});
test('notification queue does not silently discard pending process questions',()=>{
 assert.match(js,/topNoticeQueue\.findIndex\(notice=>!notice\.persistent&&!notice\.consentRequestId\)/);
});
