'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {codexArguments,codexError,executeCodex,readOutput}=require('../src/ai-provider-runtime');
const {resolveAiTarget}=require('../src/ai-models');

test('Codex defaults to HTTPS-only scoped provider with existing auth',()=>{
 const args=codexArguments();
 assert.deepEqual(args.slice(0,4),['-c','model_provider="atgv_https"','-c','model_providers.atgv_https={name="ATGV HTTPS",wire_api="responses",requires_openai_auth=true,supports_websockets=false}']);
 assert.deepEqual(args.slice(4),['exec','--json','--sandbox','read-only','--skip-git-repo-check','-']);
 assert.ok(!args.join(' ').includes('localhost'));
 const normal=codexArguments({transport:'default',model:'gpt-5.6'});
 assert.equal(normal[0],'exec');
 assert.deepEqual(normal.slice(-3),['--model','gpt-5.6','-']);
 assert.throws(()=>codexArguments({model:'hello\n--bypass'}),/invalid characters/);
 assert.throws(()=>codexArguments({transport:'other'}),/Unsupported/);
});
test('Codex target propagates transport mode and model',async()=>{
 assert.deepEqual((await resolveAiTarget({config:{provider:'codex',model:'my-model'},runtimeRoot:'/tmp/a'})).transport,'https');
 assert.deepEqual((await resolveAiTarget({config:{provider:'codex',codexTransport:'default'}})).transport,'default');
});
test('Codex WebSocket failure is classified and secret information omitted',()=>{
 const err=codexError({stderr:'ERROR codex_api::endpoint::responses_websocket: failed to connect to Responses WebSocket; Bearer ABC-SECRET',message:'failed'}, {transport:'default'});
 assert.match(err.message,/WebSocket/);
 assert.match(err.message,/HTTPS only/);
 assert.doesNotMatch(err.message,/ABC-SECRET/);
 for(const [detail,match] of [['HTTP error 401 Unauthorized',/authentication/],['HTTP error 403 Forbidden',/access was refused/],['429 rate limit',/limit reached/],['UnknownIssuer certificate',/certificate/],['connection refused',/network/]])assert.match(codexError({stderr:detail}).message,match);
});
test('Process execution preserves Codex stderr/stdout for controlled error classification',async()=>{
 const node=process.execPath;
 await assert.rejects(readOutput(node,['-e',"process.stdout.write('turn error');process.stderr.write('responses_websocket failed');process.exit(1)"],{timeoutMs:5000}),e=>e.exitCode===1&&e.stdout==='turn error'&&e.stderr.includes('responses_websocket'));
});
test('Codex exec can use HTTPS compatibility mode with real child-process event parsing', {skip:process.platform==='win32'},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-https-test-'));
 try{
  const bin=path.join(root,'node_modules','.bin','codex');fs.mkdirSync(path.dirname(bin),{recursive:true});
  fs.writeFileSync(bin,`#!/usr/bin/env node
const a=process.argv.slice(2);
if(!a.includes('model_provider="atgv_https"')||!a.some(x=>x.includes('supports_websockets=false'))){process.stderr.write('No HTTPS profile');process.exit(1)}
process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'READY'}})+'\\n')})
`);
  fs.chmodSync(bin,0o755);
  assert.equal(await executeCodex({runtimeRoot:root,prompt:'Return READY',timeoutMs:1000}),'READY');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Provider interface displays connection mode and only shows relevant endpoint',()=>{
 const r=path.join(__dirname,'..');const ui=fs.readFileSync(path.join(r,'media/start.js'),'utf8');const ext=fs.readFileSync(path.join(r,'test/generated/extension-source.txt'),'utf8');const pkg=require('../package.json');
 assert.match(ext,/id="aiCodexTransport"/);assert.match(ext,/id="aiProviderEndpointField"/);
 assert.match(ui,/syncAIProviderFields/);assert.match(ui,/codexTransport:read\('aiCodexTransport'\)/);
 assert.equal(pkg.contributes.configuration.properties['atgvAssist.ai.codexTransport'].default,'https');
});
