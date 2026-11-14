'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const runtime=fs.readFileSync(path.join(root,'src/lib/runtime/extension-runtime.js'),'utf8');
const renderer=fs.readFileSync(path.join(root,'src/lib/webview/dashboard-html.js'),'utf8');
const marker="const {createDashboardHtml}=require('../webview/dashboard-html');\nconst html=createDashboardHtml(()=>context,()=>installedVendorAssets);\n";
const begin=renderer.indexOf('function html(webview,{resumeLibrary=false}={}){');
const end=renderer.indexOf('\nreturn html;\n}',begin);
if(!runtime.includes(marker)||begin<0||end<0)throw Error('Unable to reconstruct the migrated extension source tests.');
const html=renderer.slice(begin,end)
 .replace("  const context=getContext();\n  const installedVendorAssets=getVendorAssets();\n",'')
 .replace("require('../../../package.json')", "require('../package.json')");
let source=runtime.replace(marker,html+'\n');
// Existing source-text tests assume all imports were relative to src/extension.js.
// Normalize only require paths; tests also exercise the actual extracted modules.
source=source.replace(/\brequire\((['"])(\.\.\/\.\.\/\.\.\/[^'"\r\n]+|\.\.\/\.\.\/[^'"\r\n]+)\1\)/g,(_all,q,dependency)=>{
 const old=dependency.startsWith('../../../')?'../'+dependency.slice(9):'./'+dependency.slice(6);
 return 'require('+q+old+q+')';
});
const out=path.join(root,'test/generated/extension-source.txt');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,source);
console.log('Generated legacy source-test index from live runtime and webview modules.');
