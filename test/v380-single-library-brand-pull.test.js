'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(base,'media/start.js'),'utf8');
const html=fs.readFileSync(path.join(base,'src/lib/webview/dashboard-html.js'),'utf8');
const css=fs.readFileSync(path.join(base,'media/start.css'),'utf8');
const a=ui.indexOf('function updateBrandLibraryVersion(state){');
const b=ui.indexOf("window.addEventListener('resize',fitBrandVersionLines);",a);
const fnSource=ui.slice(a,b);
function display(state){
 const nodes={headerLibraryVersion:{},gateLibraryVersion:{}};
 const update=new Function('$','fitBrandVersionLines','catalogBusyUI',fnSource+'return updateBrandLibraryVersion;')(
  key=>nodes[key],()=>{},false);
 update(state);return nodes;
}
test('both headers show ONLY the active installed Library version',()=>{
 const nodes=display({installed:{version:'1.1.12'},remote:{version:'1.1.15'},updateAvailable:true,config:{repositoryUrl:'https://github.com/test/library'}});
 for(const id of ['headerLibraryVersion','gateLibraryVersion']){
  assert.equal(nodes[id].textContent,' · Library v1.1.12');
  assert.ok(!nodes[id].textContent.includes('1.1.15'));
 }
});
test('verified activation updates exactly one version; remote only cannot pretend installed',()=>{
 const active=display({installed:{version:'1.1.15'},remote:{version:'1.1.15'},config:{repositoryUrl:'https://github.com/test/library'}});
 const missing=display({installed:null,remote:{version:'1.1.15'},config:{repositoryUrl:'https://github.com/test/library'}});
 assert.equal(active.headerLibraryVersion.textContent,' · Library v1.1.15');
 assert.equal(missing.gateLibraryVersion.textContent,' · Library not installed');
});
test('no Library Pull buttons appear beside either header logo',()=>{
 for(const id of ['headerLibraryPull','gateLibraryPull']){
  assert.ok(!html.includes('id="'+id+'"'),id);
  assert.ok(!ui.includes("'"+id+"'"),id);
 }
 assert.ok(!css.includes('.header-library-pull'));
 // The verified pull action remains available in the Catalog settings.
 assert.ok(html.includes('id="catalogPull"'));
 assert.ok(ui.includes("$('catalogPull').addEventListener('click'"));
 assert.ok(ui.includes("send('catalogPull')"));
});
test('compact logo and header styles move brand closer to left',()=>{
 assert.match(css,/v0\.3\.81: keep branding compact/);
 assert.match(css,/padding-inline-start:8px!important/);
 assert.match(css,/\.brand-area\{gap:5px!important/);
 assert.match(css,/\.brand-logo\{display:block;width:42px!important/);
 assert.match(css,/\.gate-identity\{gap:6px!important/);
});
