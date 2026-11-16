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
 const nodes={headerLibraryVersion:{},gateLibraryVersion:{},headerLibraryPull:{},gateLibraryPull:{}};
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
 for(const id of ['headerLibraryPull','gateLibraryPull'])assert.equal(nodes[id].disabled,false);
});
test('verified activation updates exactly one version; remote only cannot pretend installed',()=>{
 const active=display({installed:{version:'1.1.15'},remote:{version:'1.1.15'},config:{repositoryUrl:'https://github.com/test/library'}});
 const missing=display({installed:null,remote:{version:'1.1.15'},config:{repositoryUrl:'https://github.com/test/library'}});
 assert.equal(active.headerLibraryVersion.textContent,' · Library v1.1.15');
 assert.equal(missing.gateLibraryVersion.textContent,' · Library not installed');
});
test('Pull Latest Library delegates to existing verified host pull, not an unsafe Git operation',()=>{
 for(const id of ['headerLibraryPull','gateLibraryPull'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/for\(const id of \['headerLibraryPull','gateLibraryPull'\]\)/);
 assert.match(ui,/send\('catalogPull'\)/);
 assert.match(ui,/if\(!catalogState\?\.config\?\.repositoryUrl\|\|catalogState\?\.busy\|\|catalogBusyUI\)return/);
 const disconnected=display({installed:{version:'1.1.12'},config:{}});
 assert.equal(disconnected.headerLibraryPull.disabled,true);
 const busy=display({installed:{version:'1.1.12'},config:{repositoryUrl:'https://github.com/test/lib'},busy:true});
 assert.equal(busy.gateLibraryPull.disabled,true);
});
test('compact logo and header styles move brand closer to left',()=>{
 assert.match(css,/v0\.3\.80: keep the mark/);
 assert.match(css,/padding-inline-start:8px!important/);
 assert.match(css,/\.brand-area\{gap:5px!important/);
 assert.match(css,/\.brand-logo\{display:block;width:42px!important/);
 assert.match(css,/\.gate-identity\{gap:6px!important/);
});
