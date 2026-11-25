'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {logicalCommand}=require('./portable-command-fixture');
test('mock runners interpret Windows npm and Maven launch arguments without executing them',()=>{
 assert.deepEqual(logicalCommand('C:\\Program Files\\nodejs\\node.exe',['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js','install','--ignore-scripts']),['npm',['install','--ignore-scripts']]);
 assert.deepEqual(logicalCommand('C:\\Windows\\System32\\cmd.exe',['/d','/s','/c','mvn.cmd "-B" "-ntp" "dependency:go-offline"']),['mvn',['-B','-ntp','dependency:go-offline']]);
 assert.deepEqual(logicalCommand('java',['-version']),['java',['-version']]);
 assert.deepEqual(logicalCommand('npm',['view','demo@^1.0.0']),['npm',['view','demo@^1.0.0']]);
 assert.throws(()=>logicalCommand('cmd.exe',['/d','/s','/c','mvn.cmd "--version" & whoami']));
});
