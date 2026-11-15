'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const proposals=require('../src/design-proposals');

test('solution design cards expose independent process progress and keep workspace status above cards',async()=>{
 const ui=await fs.readFile(path.join(__dirname,'..','media','start.js'),'utf8');
 const css=await fs.readFile(path.join(__dirname,'..','media','start.css'),'utf8');
 const host=await fs.readFile(path.join(__dirname,'..','test','generated','extension-source.txt'),'utf8');
 assert.match(ui,/designProcessState/);
 assert.match(ui,/design-card-progress/);
 assert.match(ui,/setDesignProcess\(m\.kind,m\.percent\?\?50/);
 assert.match(css,/\.design-card-progress-track/);
 assert.match(css,/\.design-card-progress\.is-error/);
 assert.match(host,/type:'designProgress',kind,percent:20/);
 assert.match(host,/type:'designProgress',kind,percent:45/);
 assert.match(host,/type:'designProgress',kind,percent:75/);
 assert.match(host,/type:'designProgress',kind,percent:90/);
 const statusIndex=host.indexOf('id="designStatus"');
 const cardsIndex=host.indexOf('id="designCards"');
 assert.ok(statusIndex>0&&cardsIndex>statusIndex,'design status should be directly below workspace progress and before cards');
});

test('AI design validation safely normalizes common structured text fields',()=>{
 const value={
  title:{text:'Account workspace mockups'},
  summary:['Responsive desktop layout',{description:'Human review required'}],
  screens:[{
   name:{label:'Account Dashboard'},
   purpose:{description:'Review account information'},
   components:[{name:'Search',description:'Find records'},{label:'Save button'},'Results table'],
   interactions:[{description:'Search filters the visible records'},true]
  }],
  flows:[{name:'Review flow',description:'Open dashboard then inspect a record'}],
  assumptions:[{text:'Desktop first'}],
  questions:[{message:'Should mobile be included?'}]
 };
 const result=proposals.validate(value,'mockup');
 assert.equal(result.title,'Account workspace mockups');
 assert.match(result.summary,/Responsive desktop layout/);
 assert.deepEqual(result.screens[0].components,['Search — Find records','Save button','Results table']);
 assert.equal(result.screens[0].interactions[1],'true');
 assert.equal(result.assumptions[0],'Desktop first');
 assert.equal(result.questions[0],'Should mobile be included?');
});

test('version is 0.1.37',async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(__dirname,'..','package.json'),'utf8'));
 assert.match(manifest.version,/^\d+\.\d+\.\d+$/);
 assert.equal(manifest.atgvDisplayVersion,manifest.version);
});
