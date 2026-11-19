'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {QUESTIONS,MAX_ANSWER_LENGTH}=require('../src/ba-discovery');
const importer=require('../src/discovery-import');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('v417: long requirements text is split losslessly across bounded mapping sections',()=>{
 const src=Array.from({length:2400},(_,i)=>'Requirement '+(i+1)+': retain the original response, authorization ordering, and threshold limits.\n').join('');
 assert.ok(src.length>100000&&src.length<importer.MAX_EXTRACTED);
 const parts=importer.splitDocumentText(src);
 assert.ok(parts.length>=4,'large documents must use multiple AI calls');
 assert.ok(parts.every(part=>part.length<=importer.MAX_MAPPING_CHUNK));
 assert.equal(parts.join(''),src,'every character in the original source must be represented');
 assert.equal(importer.MAX_EXTRACTED,600000);
 assert.equal(importer.MAX_MAPPING_CHUNK,28000);
});

test('v417: source chunking retains punctuation and extremely long paragraphs',()=>{
 const src='A'.repeat(43000)+'\n'+'Question 13: Additional exceptions and thresholds.\n';
 const parts=importer.splitDocumentText(src);
 assert.equal(parts.join(''),src);
 assert.ok(parts.every(x=>x.length<=importer.MAX_MAPPING_CHUNK));
 assert.deepEqual(importer.splitDocumentText(''),['']);
});

test('v417: mapping results from every section are combined without dropping later business rules',()=>{
 const empty=()=>Object.fromEntries(QUESTIONS.map(([key])=>[key,'']));
 const first={...empty(),problem:'Initial workflow must include approval.',scope:'First-stage scope.',questions:'NONE'};
 const second={...empty(),problem:'An additional authorization must be verified.',scope:'Second-stage exceptions.',questions:'Clarify cross-border retention rules.'};
 const merged=importer.mergeMappingAnswers([first,second]);
 assert.match(merged.problem,/Initial workflow.*additional authorization/s);
 assert.match(merged.scope,/First-stage scope.*Second-stage exceptions/s);
 assert.equal(merged.questions,'Clarify cross-border retention rules.');
 assert.equal(Object.keys(merged).length,QUESTIONS.length);
 assert.ok(Object.values(merged).every(x=>x.length<=MAX_ANSWER_LENGTH));
});

test('v422: duplicate sections dedupe, and merged answers over 5k retain every character',()=>{
 const empty=()=>Object.fromEntries(QUESTIONS.map(([key])=>[key,'']));
 const result=importer.mergeMappingAnswers([{...empty(),scope:'Same scope'}, {...empty(),scope:'Same scope'}]);
 assert.equal(result.scope,'Same scope');
 const merged=importer.mergeMappingAnswers([{...empty(),scope:'A'.repeat(3500)},{...empty(),scope:'B'.repeat(3500)}]);
 assert.equal(merged.scope,'A'.repeat(3500)+'\n\n'+'B'.repeat(3500));
 assert.throws(()=>importer.mergeMappingAnswers([{...empty(),scope:'A'.repeat(60000)},{...empty(),scope:'B'.repeat(60000)}]),/100,000-character safety limit/);
});

test('v417: BA upload and mapping preserve source integrity and atomicity',()=>{
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.ok(host.includes('if(doc.truncated)throw Error('));
 assert.match(host,/baBrTextPipeline\.prepare\(registry,run\.projectId,source\)/);
 assert.match(host,/baBrTextPipeline\.mergeForDiscovery\(partAnswers,preparedUnits\)/);
 assert.match(host,/await brWorkflow\.commitSourceMapping\(/);
 const before=host.indexOf('baBrTextPipeline.mergeForDiscovery(partAnswers,preparedUnits)');
 const after=host.indexOf('await brWorkflow.commitSourceMapping(',before);
 assert.ok(before>0&&after>before,'merge every section before committing the mapping');
 assert.match(read('src/source-store.js'),/if \(digest !== entry\.digest\)/);
 assert.match(read('src/source-store.js'),/if \(doc\.truncated\)/);
});

test('v417: Section 8 shows update buttons and status, not fixed release URLs or explanation',()=>{
 const html=read('src/lib/webview/dashboard-html.js');
 const begin=html.indexOf('id="settingsSoftwareUpdateGroup"');
 const end=html.indexOf('id="projectView"',begin);
 assert.ok(begin>0&&end>begin);
 const section=html.slice(begin,end);
 for(const id of ['checkSoftwareUpdates','pullLibraryFiles','installExtensionRelease','viewExtensionRelease','softwareExtensionStatus','softwareLibraryStatus'])
  assert.ok(section.includes('id="'+id+'"'),id+' retained');
 assert.doesNotMatch(section,/Release sources are fixed and verified/);
 assert.doesNotMatch(section,/same-repository prerelease builds/);
 assert.doesNotMatch(section,/software-update-sources|Extension release:|SDLC Library release:/);
 assert.doesNotMatch(section,/https:\/\/github\.com\/aidilazharo\/(?:aiatech-assist|tech-stacks-skills)\/releases\/latest/);
 const host=read('src/lib/runtime/extension-runtime.js');
 assert.match(host,/releaseRepositoryUrl:releaseUpdater\.PINNED_RELEASE_URL/);
 assert.match(host,/libraryReleaseUrl:libraryReleaseUpdater\.LATEST_URL/);
 assert.match(host,/60\*60\*1000/);
 assert.match(require('../package.json').version,/^\d+\.\d+\.\d+$/);
});
