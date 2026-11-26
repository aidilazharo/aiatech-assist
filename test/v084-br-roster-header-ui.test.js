'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ids=['baAutoSource','baAutoDiscovery','baAutoRequirements','baAutoJira','baAutoHistory'];
test('five BR panels start collapsed and reset on navigation without hiding unsaved edits',()=>{
 const s=read('media/ba-automatic-ui.js'),a=s.indexOf('function resetWorkflowPanels(){'),b=s.indexOf('function renderReadyPanels(',a);
 assert.ok(a>=0&&b>a);
 const nodes=Object.fromEntries(ids.map(id=>[id,{open:true,hidden:false,dataset:{status:'not-started'}}]));
 let unsaved=false;
 const ctx=vm.createContext({get:id=>nodes[id],dirty:()=>unsaved});
 vm.runInContext(s.slice(a,b),ctx);
 for(const id of ids){ctx.setReadyPanel(id,'in-progress');assert.equal(nodes[id].open,false);nodes[id].open=true;}
 unsaved=true;ctx.setReadyPanel(ids[0],'ready');assert.equal(nodes[ids[0]].open,true);
 unsaved=false;ctx.setReadyPanel(ids[1],'completed');assert.equal(nodes[ids[1]].open,false);
 ctx.resetWorkflowPanels();for(const id of ids){assert.equal(nodes[id].open,false);assert.equal(nodes[id].hidden,false);}
 assert.match(s,/if\(!dirty\(\)\)resetWorkflowPanels\(\)/);
 assert.match(s,/target\.open=true;target\.scrollIntoView/);
});
test('roster search is outside add form and retains the DataTable filter handler',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js'),dt=read('media/atgv-datatables.js'),css=read('media/my-work-users.css');
 assert.match(html,/Add User<\/button><\/form><div id="overviewUserSearchHost"/);
 assert.match(ui,/searchHost:\$\('overviewUserSearchHost'\)/);
 assert.match(dt,/options\.searchHost\.replaceChildren\(search\)/);
 assert.match(dt,/search\.addEventListener\('input'/);
 assert.match(css,/\.overview-roster-search-host\{[^}]*margin-left:auto/);
});
test('BR action icons keep accessible names and original click handlers',()=>{
 const html=read('src/lib/webview/dashboard-html.js'),ui=read('media/start.js');
 assert.match(html,/id="baAutoBack"[^>]*title="Project Items" aria-label="Project Items"/);
 assert.match(html,/id="baNewRequirement"[^>]*title="New Business Requirement" aria-label="New Business Requirement"/);
 assert.match(ui,/\$\('baAutoBack'\)\.addEventListener\('click'/);
 assert.match(ui,/\$\('baNewRequirement'\)\.addEventListener\('click',beginNewBusinessRequirement\)/);
});
