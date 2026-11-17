'use strict';
// Networked CI smoke test for the exact optional SDK and platform runtime used
// by ATGV. No Copilot credentials, model request or agent tools are required.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const sdk=require('../src/copilot-repair-sdk');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-copilot-sdk-smoke-'));
 let client;
 try{
  await sdk.install(root,{onProgress:message=>process.stdout.write(String(message).slice(0,300)+'\n')});
  const loaded=await sdk.loadSdk(root);assert.equal(typeof loaded.CopilotClient,'function');
  client=new loaded.CopilotClient({workingDirectory:root});await client.start();
  assert.equal(typeof client.createSession,'function');
  console.log('Copilot SDK '+sdk.VERSION+' and its platform runtime started successfully.');
 }finally{if(client)await client.stop().catch(()=>{});await fs.rm(root,{recursive:true,force:true}).catch(()=>{});}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
