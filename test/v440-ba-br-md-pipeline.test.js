'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const pipeline=require('../src/ba-br-md-pipeline');
const importer=require('../src/discovery-import');
const {QUESTIONS,MAX_ANSWER_LENGTH}=require('../src/ba-discovery');
const hash=pipeline.sha;

test('v440: distinct numbered BRs become separate text files with lossless source coverage',()=>{
 const original='Project objectives and ownership.\nBR-001: Register application\nThe applicant must submit a form.\nBR-002: Approval\nApprovers must record decisions.\nBR-003: Audit\nThe system shall retain audit events.\n';
 const units=pipeline.split(original,{maxChars:2000});
 assert.equal(units.length,3);
 assert.deepEqual(units.map(u=>u.brIndex),[1,2,3]);
 assert.equal(units.map(u=>u.text).join(''),original);
 assert.match(units[0].text,/Project objectives/);
 assert.match(units[1].text,/BR-002/);
 assert.match(units[2].text,/BR-003/);
});

test('v440: oversized unnumbered BR is split into bounded ordered parts without inventing separate BR identities',()=>{
 const original='Business scope\n'+'A requirement must retain all data.\n'.repeat(1500);
 const units=pipeline.split(original);
 assert.ok(units.length>2);
 assert.ok(units.every(u=>u.brIndex===1&&u.text.length<=pipeline.UNIT_CHARS));
 assert.equal(units.map(u=>u.text).join(''),original);
 assert.deepEqual(units.map(u=>u.partIndex),units.map((_,i)=>i+1));
});

test('v440: documents with too many BR parts fail closed without losing data',()=>{
 const original=Array.from({length:65},(_,i)=>'BR-'+String(i+1).padStart(3,'0')+': Rule '+(i+1)+' must be followed.\n').join('');
 assert.throws(()=>pipeline.split(original),/more than 64 verified text sections/);
});

test('v440: source Markdown files persist, resume with stable names, and reject manual modifications',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-md-'));
 t.after(()=>fs.rm(folder,{force:true,recursive:true}));
 const registry={fileFor:()=>path.join(folder,'br-register.json')};
 const text='BR-001: Submit\nThe applicant must submit.\nBR-002: Approve\nThe manager must approve.\n';
 const source={digest:hash(text),name:'sample.docx',text};
 const a=await pipeline.prepare(registry,'project',source);
 const b=await pipeline.prepare(registry,'project',source);
 assert.deepEqual(a.map(x=>x.filename),b.map(x=>x.filename));
 assert.equal(a.map(x=>x.text).join(''),text);
 const first=await pipeline.read(registry,'project',a[0]);
 assert.equal(first,a[0].text);
 const file=path.join(folder,'documents','requirements','br-markdown',a[0].filename);
 await fs.writeFile(file,'tampered','utf8');
 await assert.rejects(pipeline.read(registry,'project',a[0]),/changed/);
 await assert.rejects(pipeline.prepare(registry,'project',source),/integrity/);
});

test('v440: source deletion removes only matching generated text units',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-delete-'));
 t.after(()=>fs.rm(folder,{force:true,recursive:true}));
 const registry={fileFor:()=>path.join(folder,'br-register.json')};
 const src1={text:'BR-001: One\nThe rule must apply.\n'};
 const src2={text:'BR-002: Two\nAnother rule must apply.\n'};
 src1.digest=hash(src1.text);src2.digest=hash(src2.text);
 const [a]=await pipeline.prepare(registry,'project',src1);
 const [b]=await pipeline.prepare(registry,'project',src2);
 await pipeline.removeForSource(registry,'project',src1.digest);
 await assert.rejects(pipeline.read(registry,'project',a),/missing BR Markdown file/);
 assert.equal(await pipeline.read(registry,'project',b),src2.text);
});

test('v440: per-unit mapping remains available when combined discovery exceeds the safety limit',()=>{
 const units=Array.from({length:25},(_,i)=>({filename:'BR'+(i+1)+'.md'}));
 const parts=units.map((_,i)=>Object.fromEntries(QUESTIONS.map(([key])=>[key,key==='businessRules'?('Rule '+i+': '+'X'.repeat(4900)):''])));
 const result=pipeline.mergeForDiscovery(parts,units);
 assert.ok(result.businessRules.length<=MAX_ANSWER_LENGTH);
 assert.match(result.businessRules,/SUMMARY ONLY/);
 assert.equal(parts[24].businessRules.length,4909);
 assert.equal(Object.keys(result).length,12);
});

test('v440: persisted BR mappings group continuation chunks into one logical requirement',()=>{
 const digest='a'.repeat(64);
 const refs=[
  {sourceDigest:digest,digest:'b'.repeat(64),brIndex:1,partIndex:1,parts:2,characters:4},
  {sourceDigest:digest,digest:'c'.repeat(64),brIndex:1,partIndex:2,parts:2,characters:4},
  {sourceDigest:digest,digest:'d'.repeat(64),brIndex:2,partIndex:1,parts:1,characters:4}
 ];
 for(const ref of refs)ref.filename=digest+'-BR'+String(ref.brIndex).padStart(3,'0')+'-P'+String(ref.partIndex).padStart(2,'0')+'-'+ref.digest+'.md';
 const groups=pipeline.groups([{filename:'doc.docx',units:refs}]);
 assert.deepEqual(groups.map(g=>g.units.length),[2,1]);
 assert.deepEqual(groups.map(g=>g.brIndex),[1,2]);
 assert.equal(groups[0].sourceName,'doc.docx');
});

test('v440: runtime uses extracted BR files, accumulates mappings, and generates by group',async()=>{
 const runtime=await fs.readFile(path.join(__dirname,'../src/lib/runtime/extension-runtime.js'),'utf8');
 const workflow=await fs.readFile(path.join(__dirname,'../src/br-workflow.js'),'utf8');
 assert.match(runtime,/baBrTextPipeline\.prepare\(registry,run\.projectId,source\)/);
 assert.match(runtime,/preparedUnits\.map\(\(unit,index\)=>/);
 assert.match(runtime,/baBrTextPipeline\.groups\(register\.mappingCompleted\?\.proposals/);
 assert.match(runtime,/SOURCE-SCOPED GENERATION/);
 assert.match(workflow,/mappedUnits=units\.map/);
 assert.equal(importer.MAX_EXTRACTED,600000);
});


test('v440: Markdown preserves exact extracted characters, headings and source provenance',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-md-proof-'));
 t.after(()=>fs.rm(folder,{force:true,recursive:true}));
 const registry={fileFor:()=>path.join(folder,'br-register.json')};
 const raw='BR-001: Submission\n# Source heading\n| Rule | Priority |\n| --- | --- |\n| Approval | High |\n<!-- ATGV_MD_UNIT_END:fake -->\n';
 const [ref]=await pipeline.prepare(registry,'demo',{text:raw,digest:hash(raw)});
 const file=path.join(folder,'documents','requirements','br-markdown',ref.filename);
 const markdown=await fs.readFile(file,'utf8');
 assert.match(markdown,/^# Business Requirement BR-001/m);
 assert.match(markdown,/Source SHA-256/);
 assert.match(markdown,/Verbatim extracted source/);
 assert.ok(ref.filename.endsWith('.md'));
 assert.equal(await pipeline.read(registry,'demo',ref),raw);
 assert.equal(pipeline.decodeMarkdown(ref,markdown),raw);
 assert.ok((await fs.readdir(path.dirname(file))).every(name=>name.endsWith('.md')));
 await fs.writeFile(file,markdown.replace('High','Low'),'utf8');
 await assert.rejects(pipeline.read(registry,'demo',ref),/changed/);
});

test('v440: previous TXT mapping identities migrate without restarting completed discovery',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-md-migration-'));
 t.after(()=>fs.rm(folder,{force:true,recursive:true}));
 const registry={fileFor:()=>path.join(folder,'br-register.json')};
 const raw='BR-001: Legacy\nThe system shall retain source-backed evidence.\n';
 const digest=hash(raw);
 const legacyDir=path.join(folder,'documents','requirements','br-text');
 await fs.mkdir(legacyDir,{recursive:true});
 const ref={sourceDigest:digest,digest,brIndex:1,partIndex:1,parts:1,characters:raw.length,
  filename:digest+'-BR001-P01-'+digest+'.txt',answers:{}};
 await fs.writeFile(path.join(legacyDir,ref.filename),raw,'utf8');
 assert.deepEqual(pipeline.groups([{filename:'legacy.docx',units:[ref]}]).map(g=>g.brIndex),[1]);
 assert.equal(await pipeline.read(registry,'demo',ref),raw);
 assert.equal(await pipeline.read(registry,'demo',ref),raw);
 const mdFile=path.join(folder,'documents','requirements','br-markdown',ref.filename.replace(/\.txt$/,'.md'));
 assert.match(await fs.readFile(mdFile,'utf8'),/^# Business Requirement/);
 await assert.rejects(fs.stat(path.join(legacyDir,ref.filename)),{code:'ENOENT'});
 await pipeline.removeForSource(registry,'demo',digest);
 await assert.rejects(fs.stat(mdFile),{code:'ENOENT'});
});

test('v440: fully verified Markdown preparation retires legacy TXT only after success',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-br-md-retirement-'));
 t.after(()=>fs.rm(folder,{force:true,recursive:true}));
 const registry={fileFor:()=>path.join(folder,'br-register.json')};
 const raw='BR-001: Upgrade\nPreserve this source requirement.\n',digest=hash(raw);
 const legacyDir=path.join(folder,'documents','requirements','br-text');
 await fs.mkdir(legacyDir,{recursive:true});
 const legacy=digest+'-BR001-P01-'+digest+'.txt';
 await fs.writeFile(path.join(legacyDir,legacy),raw,'utf8');
 const [current]=await pipeline.prepare(registry,'demo',{text:raw,digest});
 assert.equal(await pipeline.read(registry,'demo',{...current,filename:legacy}),raw);
 await assert.rejects(fs.stat(path.join(legacyDir,legacy)),{code:'ENOENT'});
});
