'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {selectLatest,resolveAiTarget,sendAiText,modelsEndpoint}=require('../src/ai-models');
const {modelAvailability}=require('../src/model-status');

const fakeVscode=(list)=>({lm:{selectChatModels:async (selector)=>{assert.equal(selector,undefined,'Do not filter out other providers');return list();}},CancellationTokenSource:class {token={};dispose(){}},LanguageModelChatMessage:{User:text=>({role:'user',text})}});

test('Auto chooses newest accessible model across all registered VS Code providers, not first Copilot model',async()=>{
 const catalog=[{id:'gpt-4o',name:'GPT-4o',vendor:'copilot',version:'2024-05-13',sendRequest:async()=>({text:asyncText('old')})},
   {id:'gemini-next',name:'Gemini Next',vendor:'google',version:'2026-04-12',sendRequest:async()=>({text:asyncText('new')})},
   {id:'claude-test',name:'Claude',vendor:'anthropic',version:'2025-11-20',sendRequest:async()=>({text:asyncText('middle')})}];
 const vs=fakeVscode(()=>catalog);
 const chosen=await resolveAiTarget({vscodeApi:vs,config:{provider:'auto'}});
 assert.equal(chosen.vendor,'google');assert.equal(chosen.name,'Gemini Next');
 assert.equal(await sendAiText({vscodeApi:vs,target:chosen,prompt:'test'}),'new');
 assert.equal((await modelAvailability({config:{provider:'auto'},models:()=>Promise.resolve(catalog)})).name,'Gemini Next');
});
async function* asyncText(...parts){for(const part of parts)yield part;}

test('Auto refreshes model availability at every new request, and respects explicitly preferred vendor',async()=>{
 let current=[{id:'a',name:'First',vendor:'copilot',version:'2025-01-01'}];const vs=fakeVscode(()=>current);
 assert.equal((await resolveAiTarget({vscodeApi:vs,config:{provider:'auto'}})).name,'First');
 current.push({id:'b',name:'New',vendor:'anthropic',version:'2026-10-22'});
 assert.equal((await resolveAiTarget({vscodeApi:vs,config:{provider:'auto'}})).name,'New');
 assert.equal((await resolveAiTarget({vscodeApi:vs,config:{provider:'auto',preferredVendor:'copilot'}})).name,'First');
 await assert.rejects(resolveAiTarget({vscodeApi:vs,config:{provider:'auto',preferredVendor:'unknown'}}),/No accessible models/);
});

test('Auto is explicit and safe: no silent fallback to unapproved endpoint when VS Code has no models',async()=>{
 const vs=fakeVscode(()=>[]);
 await assert.rejects(resolveAiTarget({vscodeApi:vs,config:{provider:'auto',endpoint:'https://other.example/v1'}}),/No accessible AI models/);
 await assert.rejects(resolveAiTarget({vscodeApi:vs,config:{provider:'none'}}),/retrieval-only/);
});

test('Ollama auto discovers installed model on demand and sends the correct chat request',async()=>{
 const calls=[];
 const request=async(url,options)=>{calls.push({url,options});if(url.endsWith('/api/tags'))return {models:[{name:'llama3.2:latest'},{name:'llama4:latest'}]};return {message:{content:'{"answers":{}}'}};};
 const chosen=await resolveAiTarget({config:{provider:'ollama',model:'auto',endpoint:'http://localhost:11434'},request});
 assert.equal(chosen.name,'llama4:latest');
 assert.equal(await sendAiText({target:chosen,prompt:'question',json:true,request}),'{"answers":{}}');
 assert.equal(calls[1].options.data.model,'llama4:latest');assert.equal(calls[1].options.data.format,'json');
});

test('OpenAI-compatible model auto-discovery enforces token, strict endpoint and handles text',async()=>{
 assert.equal(modelsEndpoint('https://models.example/v1/chat/completions'),'https://models.example/v1/models');
 const calls=[];const request=async(url,options)=>{calls.push({url,options});if(url.endsWith('/models'))return {data:[{id:'gpt-5.1'},{id:'gpt-6'}]};return {choices:[{message:{content:'Approved draft'}}]};};
 await assert.rejects(resolveAiTarget({config:{provider:'openai-compatible',endpoint:'https://models.example/v1/chat/completions'},request}),/API key/);
 await assert.rejects(resolveAiTarget({config:{provider:'openai-compatible',endpoint:'http://remote.example/v1/chat/completions'},secret:'secret',request}),/HTTPS/);
 const target=await resolveAiTarget({config:{provider:'openai-compatible',model:'auto',endpoint:'https://models.example/v1/chat/completions'},secret:'secret',request});
 assert.equal(target.modelId,'gpt-6');
 assert.equal(await sendAiText({target,prompt:'write',request}),'Approved draft');
 assert.equal(calls[0].options.token,'secret');assert.equal(calls[1].options.token,'secret');
});

test('Router caps streamed output, and business workflows share its selected target',async()=>{
 const model={id:'current',name:'Current',vendor:'other',sendRequest:async()=>({text:asyncText('abcdef','ghijkl')})};
 const vs=fakeVscode(()=>[model]);const target=await resolveAiTarget({vscodeApi:vs,config:{provider:'auto'}});
 await assert.rejects(sendAiText({vscodeApi:vs,target,prompt:'test',maxChars:10}),/allowed size/);
 const code=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 for(const workflow of ['importDiscoveryDocument','aiDiscoverySuggestion','generateBusinessRequirements','aiDrafts','generateRag'])assert.match(code,new RegExp(`async function ${workflow}\\(`));
 assert.equal((code.match(/selectChatModels\(\{vendor:'copilot'\}\)/g)||[]).length,0);
 const pkg=require('../package.json');assert.equal(pkg.contributes.configuration.properties['atgvAssist.rag.provider'].default,'auto');
});
