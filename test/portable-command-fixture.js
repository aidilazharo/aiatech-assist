'use strict';
// Decode production Windows argv only in mocked runners; real subprocesses
// must continue using the original production launchers.
const assert=require('node:assert/strict');
function logicalCommand(bin,args){
 if(/[\\/]npm-cli\.js$/i.test(args[0]||'')){
  assert.match(bin,/(?:^|[\\/])node(?:\.exe)?$/i);
  return ['npm',args.slice(1)];
 }
 if(/(?:^|[\\/])cmd(?:\.exe)?$/i.test(bin)&&args[3]?.startsWith('mvn.cmd ')){
  assert.deepEqual(args.slice(0,3),['/d','/s','/c']);
  assert.equal(args.length,4);
  const values=Array.from(args[3].matchAll(/"([^"]*)"/g),m=>m[1]);
  assert.equal(args[3],'mvn.cmd '+values.map(v=>'"'+v+'"').join(' '));
  return ['mvn',values];
 }
 return [bin,args];
}
module.exports={logicalCommand};
