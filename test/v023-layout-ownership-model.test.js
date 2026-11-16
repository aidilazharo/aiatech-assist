'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {transitionOwnership,identifier,accountIdentifier,OwnershipRegistry}=require('../src/ownership');
const {JiraConfluenceCoordination}=require('../src/atlassian-coordination');
const {modelAvailability,checkEndpointUrl}=require('../src/model-status');
const source=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
const script=fs.readFileSync(path.join(__dirname,'../media/start.js'),'utf8');
test('opaque Jira account IDs with colon are accepted and owner-only approval is still enforced',()=>{
 const alice='712020:7eab3cbe-2051-44bf-a435-0123456789aa',bob='557058:eeeb2a29-554f-477a-90ac-000000000000';
 assert.equal(accountIdentifier(alice),alice);
 assert.throws(()=>identifier(alice),/Invalid identifier/);
 const claimed=transitionOwnership(null,{actor:alice,action:'claim',expectedRevision:0});
 const requested=transitionOwnership(claimed,{actor:bob,action:'request-transfer',expectedRevision:1});
 assert.throws(()=>transitionOwnership(requested,{actor:bob,action:'approve-transfer',expectedRevision:2}),/Only the current/);
 assert.equal(transitionOwnership(requested,{actor:alice,action:'approve-transfer',expectedRevision:2}).ownerId,bob);
 for(const invalid of ['', '\x00abc', 'a'.repeat(256)])assert.throws(()=>accountIdentifier(invalid),/Invalid verified user/);
});
test('local ownership still rejects invalid project/document keys and actors',async()=>{
 const file='/tmp/atgv-023-local-registry-'+process.pid+'.json';
 const db=new OwnershipRegistry(file);
 await assert.rejects(db.act({project:'proj',document:'foo/bar',actor:'local',action:'claim',expectedRevision:0}),/Invalid identifier/);
 await assert.rejects(db.act({project:'proj',document:'doc',actor:'712020:abc',action:'claim',expectedRevision:0}),/Invalid identifier/);
});
test('model state green for available provider, gray for no permission, red for unreachable configured model',async()=>{
 assert.deepEqual(await modelAvailability({config:{provider:'auto'},models:async()=>[{name:'GPT-4.1',id:'copilot-gpt-4.1'}]}),{name:'GPT-4.1',state:'ready',message:'Online / ready'});
 assert.equal((await modelAvailability({config:{provider:'auto'},models:async()=>[]})).state,'inactive');
 assert.equal((await modelAvailability({config:{provider:'openai-compatible',model:'Corp LLM',endpoint:'https://model.example/v1/chat/completions'}})).message,'Permission or access required');
 assert.equal((await modelAvailability({config:{provider:'ollama',model:'llama3.2',endpoint:'http://localhost:11434'},fetchImpl:async()=>{throw Error('offline');}})).state,'error');
});
test('configured Ollama checks installed model, not merely server responsiveness',async()=>{
 const config={provider:'ollama',model:'llama3.2',endpoint:'http://127.0.0.1:11434'};
 assert.equal((await modelAvailability({config,fetchImpl:async()=>new Response(JSON.stringify({models:[{name:'llama3.2:latest'}]}),{status:200})})).state,'ready');
 assert.equal((await modelAvailability({config,fetchImpl:async()=>new Response(JSON.stringify({models:[]}),{status:200})})).state,'error');
 assert.throws(()=>checkEndpointUrl('http://remote.example/v1','openai-compatible'),/HTTPS/);
});
test('project switch remains below role and AI model selector lives below sidebar handoffs',()=>{
 const header=source.split('<header class="app-header"')[1].split('</header>')[0];
 const sidebar=source.split('<div class="sidebar-footer">')[1].split('</aside>')[0];
 assert.doesNotMatch(header,/SwitchProject/);
 assert.doesNotMatch(header,/id="headerModelName"/);
 assert.match(header,/id="headerUserName"/);
 const navigation=source.split('<aside class="sidebar"')[1].split('</aside>')[0];
 assert.ok(navigation.indexOf('id="headerModelName"')>navigation.indexOf('data-nav="operations"'));
 assert.match(navigation,/id="headerModelState"/);
 assert.ok(sidebar.indexOf('id="sidebarRole"')<sidebar.indexOf('id="sidebarSwitchProject"'));
 assert.doesNotMatch(sidebar,/ACTIVE SDLC ROLE|sidebarRoleStage/);
 assert.match(script,/headerModelName/);assert.match(script,/headerModelState/);
});
