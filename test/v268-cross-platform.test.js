'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {nodeExecutable,npmCommand,codexCommand} = require('../src/platform-process');
const {nativePlatformMismatch} = require('../src/stack-dependency-helper');
const {nodeRuntime} = require('../service/ai/install');

test('npm uses no shell on macOS and Linux',()=>{
 for(const platform of ['darwin','linux']) assert.deepEqual(npmCommand(['run','test'],{platform}),{bin:'npm',args:['run','test']});
});
test('mock API resolves standalone Node from an absolute Windows PATH entry with spaces',()=>{
 const node='C:\\Program Files\\nodejs\\node.exe',probes=[];
 const actual=nodeExecutable({platform:'win32',env:{Path:';relative;D:\\missing;"C:\\Program Files\\nodejs"'},executable:file=>{
  probes.push(file);return file===node;
 }});
 assert.equal(actual,node);
 assert.deepEqual(probes,['D:\\missing\\node.exe',node]);
});
test('mock API resolves standalone Node on macOS and Linux or reports missing Node',()=>{
 for(const platform of ['darwin','linux']){
  assert.equal(nodeExecutable({platform,env:{PATH:'.:/opt/node/bin:/usr/bin'},executable:file=>file==='/opt/node/bin/node'}),'/opt/node/bin/node');
 }
 assert.throws(()=>nodeExecutable({platform:'linux',env:{PATH:'.:relative:'},executable:()=>true}),/Node.js is unavailable for the mock API/);
});
test('Windows npm resolves npm-cli.js and node.exe from a path with spaces',()=>{
 const base='C:\\Program Files\\nodejs', cli=path.win32.join(base,'node_modules','npm','bin','npm-cli.js');
 const locations=new Set([cli,path.win32.join(base,'node.exe')]);
 const value=npmCommand(['run','test'],{platform:'win32',env:{Path:`D:\\bin;${base}`},exists:file=>locations.has(file)});
 assert.equal(value.bin,path.win32.join(base,'node.exe'));
 assert.deepEqual(value.args,[cli,'run','test']);
});
test('Windows npm also resolves npm_execpath when npm is installed separately',()=>{
 const cli='C:\\tools\\npm\\npm-cli.js';
 const value=npmCommand(['ls'],{platform:'win32',env:{npm_execpath:cli,Path:''},exists:file=>file===cli});
 assert.equal(value.bin,'node.exe');assert.deepEqual(value.args,[cli,'ls']);
});
test('Windows missing npm gives actionable dependency error instead of spawning a shell shim',()=>{
 assert.throws(()=>npmCommand(['run','test'],{platform:'win32',env:{Path:'C:\\bad'},exists:()=>false}),/Install Node.js LTS with npm/);
});
test('Windows Codex JS shim executes via node.exe without a shell',()=>{
 const binary='C:\\ATGV\\node_modules\\@openai\\codex\\bin\\codex.js';
 assert.deepEqual(codexCommand(binary,['--version'],{platform:'win32'}),{bin:'node.exe',args:[binary,'--version']});
 const shim='C:\\ATGV\\node_modules\\.bin\\codex.cmd';
 const result=codexCommand(shim,['--version'],{platform:'win32',exists:p=>p===binary});
 assert.deepEqual(result,{bin:'node.exe',args:[binary,'--version']});
 assert.throws(()=>codexCommand(shim,['--version'],{platform:'win32',exists:()=>false}),/Reinstall Codex/);
});
test('Copied native npm packages from another OS trigger dependency repair',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-platform-native-'));
 try{
  fs.mkdirSync(path.join(root,'node_modules','@esbuild','darwin-arm64'),{recursive:true});
  assert.equal(await nativePlatformMismatch(root,{platform:'linux',arch:'x64'}),true);
  fs.mkdirSync(path.join(root,'node_modules','@esbuild','linux-x64'),{recursive:true});
  assert.equal(await nativePlatformMismatch(root,{platform:'linux',arch:'x64'}),false);
  assert.equal(await nativePlatformMismatch(root,{platform:'darwin',arch:'arm64'}),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Background AI service uses the installed external Node runtime',async()=>{
 const value=await nodeRuntime(process.execPath);
 assert.equal(path.resolve(value),path.resolve(process.execPath));
});
