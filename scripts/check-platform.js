'use strict';
// Read-only platform prerequisites check; does not install software.
const {execFileSync} = require('node:child_process');
const {npmCommand} = require('../src/platform-process');
function check(bin,args){
 try{return execFileSync(bin,args,{encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim().split(/\r?\n/)[0];}
 catch{return null;}
}
const major=Number(process.versions.node.split('.')[0]);
const minor=Number(process.versions.node.split('.')[1]);
const nodeOk=major>22 || (major===22&&minor>=13);
const git=check('git',['--version']);
let npm=null;
try{const c=npmCommand(['--version']);npm=check(c.bin,c.args);}catch(e){npm=null;}
console.log(`Platform: ${process.platform}/${process.arch}`);
console.log(`Node: ${process.versions.node}${nodeOk?' [AI background service supported]':' [upgrade to 22.13+ for AI background service]'}`);
console.log(`Git: ${git||'MISSING (install Git and add it to PATH)'}`);
console.log(`npm: ${npm||'MISSING (install Node.js with npm)'}`);
console.log('VSIX runtime: no third-party native packages; includes bundled webview assets.');
console.log('Project-specific toolchains: .NET SDK / JDK+Maven only when the selected technology stack requires them.');
console.log('Optional VSIX source packaging: Python 3 (Windows py -3, macOS/Linux python3).');
if(!git||!npm||!nodeOk)process.exitCode=1;
