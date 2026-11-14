'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
const host=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const work=fs.readFileSync(path.join(__dirname,'../src/delivery-work.js'),'utf8');

test('My Work role scope follows the selected sidebar role without an all-role override',()=>{
 assert.match(js,/roles\.value=selectedRole/);
 assert.match(js,/const roleItems=all\.filter\(item=>item\.role_id===selectedRole\)/);
 assert.match(js,/\$\('deliveryRoleFilter'\)\.addEventListener\('change',event=>navigate\(event\.target\.value\)\)/);
 assert.doesNotMatch(js,/roleItems=all\.filter\(item=>!roleFilter\|\|item\.role_id===roleFilter\)/);
});
test('Claimed but not yet started handoff is visible in the My Work filter',()=>{
 assert.match(js,/const assignedToMe=item=>/);
 assert.match(js,/doc\.documentId==='handoff-'\+item\.role_id\+'-'\+item\.br_id&&doc\.ownerId===handoffOwnership\.me/);
 assert.match(js,/filter==='mine'&&assignedToMe\(item\)/);
});
test('BA discovery, requirements and stories use the canonical guarded nine-step workflow',()=>{
 assert.match(js,/\['discovery','requirements','stories'\]\.includes\(item\.task_id\)/);
 assert.match(js,/action\.textContent='Open Business Requirements';action\.disabled=!activeId/);
 assert.match(js,/action\.addEventListener\('click',\(\)=>navigate\('discovery'\)\)/);
 assert.match(host,/aria-label="Business Requirements progress/);
 assert.match(host,/case 'deliveryStart':\{/);
});
test('Unassigned delivery items only offer claim or transfer; backend checks ownership',()=>{
 assert.match(js,/const operation=ownerDoc\?\.ownerId\?'request-transfer':'claim'/);
 assert.match(js,/send\('roleHandoffAction',\{handoffId:handoff\.id,action:operation,revision:ownerDoc\?\.revision\|\|0\}\)/);
 assert.match(host,/if\(!owner\.me\|\|!owner\.documents\.some\(x=>x\.documentId==='handoff-'\+handoff\.id&&x\.ownerId===owner\.me\)\)throw Error\('Assign to Me for this role handoff before starting work\.'\)/);
 assert.match(work,/if\(!actor\)throw Error\('Assign to Me before starting work\.'\)/);
});
