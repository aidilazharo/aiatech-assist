
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../media/start.css'),'utf8');
const marker='<section id="developerBrWorkspace"';
const end='<div class="developer-br-live-status">';
const markup=source.slice(source.indexOf(marker),source.indexOf(end,source.indexOf(marker)));

test('circular nine-step development progress appears before BR selection and action row',()=>{
 const steps=markup.indexOf('id="developerBrSteps"');
 const select=markup.indexOf('id="developerBrSelect"');
 const start=markup.indexOf('id="developerBrStart"');
 assert.ok(steps>0&&select>steps&&start>select);
 assert.equal((markup.match(/class="developer-workflow-step[^"]*developer-br-stage/g)||[]).length,9);
 assert.equal((markup.match(/id="developerBrDetails"/g)||[]).length,1);
 assert.equal((markup.match(/id="developerBrSteps"/g)||[]).length,1);
 assert.equal((markup.match(/id="developerBrSelect"/g)||[]).length,1);
});

test('no redundant visual BR selector label; existing accessible name and controls remain',()=>{
 assert.doesNotMatch(markup,/<label\s+for="developerBrSelect"[^>]*>Approved Business Requirement<\/label>/);
 assert.match(markup,/<select id="developerBrSelect" aria-label="Select an approved Business Requirement"/);
 assert.match(markup,/id="developerBrStart"/);
 assert.match(markup,/id="developerBrRevision"/);
 assert.match(css,/developer-br-details > \.developer-br-steps/);
});
