'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeMapping,canCreatePage,validateProjectConnection}=require('../src/project-connection-validation');
const base=path.join(__dirname,'..');
const host=fs.readFileSync(path.join(base,'test/generated/extension-source.txt'),'utf8');
const ui=fs.readFileSync(path.join(base,'media/start.js'),'utf8');
const config={get:key=>({'jira.baseUrl':'https://example.atlassian.net','jira.email':'developer@example.org','confluence.baseUrl':'https://example.atlassian.net/wiki'})[key]||''};

test('project modal is accessible and opens from each Project setting control',()=>{
 for(const id of ['overviewJiraMappingStatus','overviewConfluenceMappingStatus','projectConnectionKey','projectConnectionTest','projectConnectionSave','projectConnectionModal'])assert.match(host,new RegExp(`id="${id}"`));
 assert.match(host,/role="dialog" aria-modal="true" aria-labelledby="projectConnectionModalTitle"/);
 assert.match(ui,/openProjectConnectionModal\('jira'\)/);
 assert.match(ui,/openProjectConnectionModal\('confluence'\)/);
 assert.match(ui,/invalidateMappingTest\(\)/);
 assert.match(ui,/send\('testProjectConnectionMapping'/);
 assert.match(ui,/send\('saveProjectConnectionMapping'/);
 assert.match(ui,/m.kind!==mappingModalKind/);
});

test('project mappings are saved only after host-side permission proof on the same project and key',()=>{
 assert.match(host,/pendingProjectMappingTests\.get\(kind\)/);
 assert.match(host,/projectMappingProof\(project,kind,key,token\)/);
 assert.match(host,/Test permissions for this exact key before saving/);
 assert.match(host,/registry\.update\(project\.id/);
 assert.match(host,/Existing Business Requirements are published to Jira/);
 assert.match(host,/spaceId:tested\.outcome\.id,spaceName:tested\.outcome\.name/);
});

test('normalization accepts valid keys, normalizes case, rejects invalid keys',()=>{
 assert.equal(normalizeMapping('jira',' tc '),'TC');
 assert.equal(normalizeMapping('confluence',' tcc '),'TCC');
 assert.throws(()=>normalizeMapping('jira','9bad'),/valid Jira/);
 assert.throws(()=>normalizeMapping('confluence','bad key'),/valid Confluence/);
 assert.throws(()=>normalizeMapping('garbage','TC'),/Unsupported/);
});

test('Jira Test Permissions confirms both Browse Projects and Create Issues with GET only',async()=>{
 const requests=[];
 const result=await validateProjectConnection({kind:'jira',key:'tc',config,token:'secret',request:async(url,opts)=>{
  requests.push({url,opts});
  if(url.includes('/mypermissions'))return {permissions:{BROWSE_PROJECTS:{havePermission:true},CREATE_ISSUES:{havePermission:true}}};
  return {id:'101',key:'TC',name:'Tech Cockpit'};
 }});
 assert.equal(result.key,'TC');assert.deepEqual(result.permissions,['Browse Projects','Create Issues']);
 assert.equal(requests.length,2);
 assert.ok(requests.every(x=>!x.opts.method&&x.opts.token==='secret'&&x.opts.basicEmail==='developer@example.org'));
});

test('Jira denial or inconclusive permission blocks save',async()=>{
 for(const create of [false,undefined]){
  await assert.rejects(validateProjectConnection({kind:'jira',key:'TC',config,token:'secret',request:async(url)=>url.includes('/mypermissions')?{permissions:{BROWSE_PROJECTS:{havePermission:true},CREATE_ISSUES:{havePermission:create}}}:{key:'TC'}}),/Create Issues.*not saved/);
 }
 await assert.rejects(validateProjectConnection({kind:'jira',key:'TC',config,token:'secret',request:async()=>({key:'OTHER'})}),/different project key/);
});

test('Confluence Test Permissions verifies space identity and create-page operation with GET only',async()=>{
 const requests=[];
 const result=await validateProjectConnection({kind:'confluence',key:'tcc',config,token:'secret',request:async(url,opts)=>{
  requests.push({url,opts});
  if(url.includes('?keys='))return {results:[{key:'TCC',id:'4882442',name:'Tech Cockpit'}]};
  return {id:'4882442',key:'TCC',name:'Tech Cockpit Confluence',operations:{results:[{operation:'read',targetType:'space'},{operation:'create',targetType:'page'}]}};
 }});
 assert.equal(result.id,'4882442');assert.equal(result.name,'Tech Cockpit Confluence');
 assert.deepEqual(result.permissions,['View Space','Create Page']);
 assert.ok(requests.every(x=>!x.opts.method));
 assert.match(requests[1].url,/include-operations=true/);
});

test('Confluence missing or unreadable permissions blocks save without write probe',async()=>{
 assert.equal(canCreatePage([{operation:'create',targetType:'page'}]),true);
 assert.equal(canCreatePage([{operation:{key:'create',targetType:'page'}}]),true);
 assert.equal(canCreatePage([{operation:'read',targetType:'page'}]),false);
 assert.equal(canCreatePage(undefined),false);
 await assert.rejects(validateProjectConnection({kind:'confluence',key:'TCC',config,token:'secret',request:async(url)=>url.includes('?keys=')?{results:[{key:'TCC',id:'4882442'}]}:{id:'4882442',key:'TCC',operations:{results:[{operation:'read',targetType:'space'}]}}}),/Create Page permission.*not saved/);
});

test('missing credentials and project key fail closed',async()=>{
 await assert.rejects(validateProjectConnection({kind:'jira',key:'TC',config,token:''}),/API token is missing/);
 await assert.rejects(validateProjectConnection({kind:'jira',key:'not a key',config,token:'secret'}),/valid Jira/);
});
