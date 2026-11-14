'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {resolveAiTarget,sendAiText}=require('../src/ai-models');
const {codexText,checkCodex,codexBinary,readOutput}=require('../src/ai-provider-runtime');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('provider router requires credentials and explicit cloud model',async()=>{
 for(const provider of ['openai','anthropic','azure-openai']){
  await assert.rejects(resolveAiTarget({config:{provider,model:'example-model'}}),/credentials/i);
  await assert.rejects(resolveAiTarget({config:{provider,model:'auto'},secret:'test'}),/approved .*model/i);
 }
 await assert.rejects(resolveAiTarget({config:{provider:'azure-openai',model:'deployment'},secret:'test',}),/endpoint/i);
});
test('OpenAI API uses Responses and extracts output text',async()=>{
 const target=await resolveAiTarget({config:{provider:'openai',model:'approved-model',endpoint:'http://localhost:11434'},secret:'mock-key'});
 assert.equal(target.endpoint,'https://api.openai.com/v1/responses');
 const output=await sendAiText({target,prompt:'test',request:async(url,opts)=>{assert.equal(url,target.endpoint);assert.equal(opts.data.model,'approved-model');return {output:[{content:[{type:'output_text',text:'READY'}]}]};}});
 assert.equal(output,'READY');
});
test('Anthropic API uses proper headers and reads text blocks',async()=>{
 const target=await resolveAiTarget({config:{provider:'anthropic',model:'approved-claude'},secret:'mock-key'});
 assert.equal(await sendAiText({target,prompt:'ping',request:async(url,opts)=>{assert.equal(opts.headers['x-api-key'],'mock-key');return {content:[{type:'thinking',text:'private'},{type:'text',text:'READY'}]};}}),'READY');
});
test('Cloud providers return actionable errors without leaking keys',async()=>{
 const target=await resolveAiTarget({config:{provider:'openai',model:'approved-model'},secret:'do-not-print'});
 await assert.rejects(sendAiText({target,prompt:'hi',request:async()=>({output:[]})}),e=>/empty text response/.test(e.message)&&!e.message.includes('do-not-print'));
});
test('Codex JSONL final answer parser rejects failures and skips tool output',()=>{
 const example=[{type:'item.completed',item:{type:'command_execution',aggregated_output:'SECRET'}},{type:'item.completed',item:{type:'agent_message',text:'READY'}}].map(JSON.stringify).join('\n');
 assert.equal(codexText(example),'READY');
 assert.throws(()=>codexText(JSON.stringify({type:'turn.failed',error:{message:'Sign in required'}})),/Sign in required/);
});
test('Codex runtime can be detected from extension-managed installation without system modification',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-test-codex-'));
 try{const binary=path.join(root,'node_modules','.bin',process.platform==='win32'?'codex.cmd':'codex');fs.mkdirSync(path.dirname(binary),{recursive:true});fs.writeFileSync(binary,'placeholder');assert.equal(codexBinary(root),binary);}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Codex runtime uses child process isolation, not a shell or arbitrary script eval',()=>{
 const runtime=read('src/ai-provider-runtime.js');assert.match(runtime,/shell:false/);assert.match(runtime,/--sandbox','read-only'/);assert.match(runtime,/npm_config_registry:'https:\/\/registry\.npmjs\.org\//);
 assert.match(read('test/generated/extension-source.txt'),/uiWarning\('Install the official OpenAI Codex runtime/);
});
test('AI provider UI, backend and metadata are connected',()=>{
 const extension=read('test/generated/extension-source.txt'),ui=read('media/start.js'),manifest=JSON.parse(read('package.json'));
 for(const id of ['aiProvidersSection','aiProviderChoice','aiProviderSave','aiProviderTest','aiCodexInstall'])assert.ok(extension.includes('id="'+id+'"'));
 for(const cmd of ['getAiProviderState','saveAiProvider','testAiProvider','installCodexRuntime'])assert.ok(ui.includes("send('"+cmd+"'"));
 assert.ok(manifest.contributes.configuration.properties['atgvAssist.rag.provider'].enum.includes('codex'));
});
