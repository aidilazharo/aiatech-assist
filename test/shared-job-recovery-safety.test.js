'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {retryRecoverable,safeError,transient}=require('../src/atgv-job-engine');
test('permission, ownership, quota and cancellation override transient-looking errors',async()=>{
 const errors=[Object.assign(Error('timeout'),{status:403}),Object.assign(Error('rate limit'),{code:'EACCES'}),Error('HTTP 401 timeout'),Error('Permission denied; timeout'),Error('quota exceeded; rate limit'),Error('checkpoint mismatch; timeout'),Object.assign(Error('timeout'),{name:'AbortError'})];
 for(const error of errors){
  assert.equal(transient(error),false,error.message);let calls=0;
  await assert.rejects(retryRecoverable(async()=>{calls++;throw error;},{baseDelayMs:0}),e=>e===error);
  assert.equal(calls,1);
 }
});
test('genuine transient failures retry with bounded budget',async()=>{
 let calls=0;const error=Object.assign(Error('Service timed out'),{status:503});
 const result=await retryRecoverable(async()=>{if(++calls===1)throw error;return 'verified';},{baseDelayMs:0,maxAttempts:2});
 assert.equal(result,'verified');assert.equal(calls,2);
 calls=0;await assert.rejects(retryRecoverable(async()=>{calls++;throw error;},{baseDelayMs:0,maxAttempts:2}),e=>e===error);assert.equal(calls,2);
});
test('cancelled work cannot report successful output or retry after provider error',async()=>{
 for(const fail of [false,true]){
  const controller=new AbortController();let calls=0;
  await assert.rejects(retryRecoverable(async()=>{calls++;controller.abort();if(fail)throw Error('timeout');return 'late result';},{signal:controller.signal,baseDelayMs:0}),{name:'AbortError'});
  assert.equal(calls,1);
 }
});
test('journal diagnostics redact common secrets before truncation',()=>{
 const samples=[['Atlassian ATATTabcdefghijklmnop','ATATTabcdefghijklmnop'],['GitHub gho_abcdefghijklmnop','gho_abcdefghijklmnop'],['https://secret-user@example.test/path','secret-user'],['https://example.test/?api_key=secret-query','secret-query'],['{"client_secret":"secret value"}','secret value'],['password=secret-pass','secret-pass'],['-----BEGIN PRIVATE KEY-----\nsecret-body\n-----END PRIVATE KEY-----','secret-body']];
 for(const [input,secret] of samples){const output=safeError(input);assert.ok(!output.includes(secret),output);assert.match(output,/REDACTED/);}
 assert.equal(safeError('a'.repeat(300)).length,200);
});
