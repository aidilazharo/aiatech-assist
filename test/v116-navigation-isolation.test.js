"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const start=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const allViews=['gate','landing','settings','project','work','uxPreview','documents','documentEditor','planning','discovery','flow','operations','knowledge','library'];
const viewId=view=>view==='landing'?'landingView':view+'View';

test('every workspace view including SDLC Readiness has valid id and hidden initial class',()=>{
  for(const view of allViews){
    const id=viewId(view);
    const element=view==='discovery'?'section':'main';
    const tag=html.match(new RegExp('<'+element+'\\s+id="'+id+'"\\s+class="([^"]+)"','g'))||[];
    assert.equal(tag.length,1,'exactly one valid page tag for '+view);
    if(view!=='gate')assert.match(tag[0],/class="[^"]*hidden(?:\s|\")/,'must initially hide '+id);
  }
  assert.doesNotMatch(html,/id="[^"]+ class=/,'no embedded class attribute inside an id');
  const mainTags=[...html.matchAll(/<main\s+id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(mainTags.length,allViews.length-1,'the BR workflow is embedded, not a second page');
  assert.deepEqual(new Set(mainTags),new Set(allViews.filter(x=>x!=='discovery').map(viewId)));
});

test('every sidebar menu routes to a dedicated workspace page',()=>{
  const routes={overview:'landing', 'sdlc-roles':'work',flow:'flow',documents:'documents',planning:'planning',knowledge:'knowledge',library:'library',operations:'operations',settings:'settings'};
  for(const [route,page] of Object.entries(routes)){
    assert.match(html,new RegExp('data-nav="'+route+'"'),'sidebar has route '+route);
    assert.match(html,new RegExp('<main id="'+viewId(page)+'"'),'route '+route+' points to actual page');
  }
  assert.match(start,/if\(destination==='flow'\)\{setView\('flow'\)/);
  assert.match(start,/if\(destination==='planning'\)\{setView\('planning'\)/);
  assert.match(start,/if\(destination==='knowledge'\)\{setView\('knowledge'\)/);
  assert.match(start,/if\(destination==='operations'\)\{setView\('operations'\)/);
});

test('setView hides every non-selected page including SDLC Readiness, and keeps unknown routes safe',()=>{
  const functionCode=start.slice(start.indexOf('function setView(next){'),start.indexOf('\nfunction cell(',start.indexOf('function setView(next){')));
  assert.match(functionCode,/#contentPane > main/);
  const pages=allViews.filter(name=>name!=='discovery').map(name=>({id:viewId(name),hidden:name!=='flow',classList:{toggle(flag,value){if(flag==='hidden')this.owner.hidden=value}}}));
  const discovery={id:'discoveryView',hidden:true,classList:{toggle(flag,value){if(flag==='hidden')this.owner.hidden=value}}};
  discovery.classList.owner=discovery;
  for(const page of pages)page.classList.owner=page;
  const byId=new Map([...pages,discovery].map(page=>[page.id,page]));
  const pane={scrollTop:47};let events=0,errors=0;
  const context={document:{querySelectorAll(selector){assert.equal(selector,'#contentPane > main');return pages;},getElementById:id=>byId.get(id)},console:{error(){errors++}},Event:class{constructor(type){this.type=type}},window:{dispatchEvent(e){assert.equal(e.type,'atgv:viewchange');events++}},$:(id)=>id==='contentPane'?pane:byId.get(id),baResumeCardReady:false,baViewedStep:null,brState:null,baHasRecoverableBR:()=>false};
  vm.createContext(context);
  vm.runInContext('let view="flow";\n'+functionCode+'\nthis.switchView=setView;this.getView=()=>view;',context);
  for(const current of allViews){
    context.switchView(current);
    assert.equal(pages.filter(p=>!p.hidden).length,1,'exactly one visible page at '+current);
    assert.equal(pages.find(p=>!p.hidden).id,current==='discovery'?'workView':viewId(current));
    assert.equal(discovery.hidden,current!=='discovery');
    assert.equal(context.getView(),current);
    assert.equal(pane.scrollTop,0);
  }
  const before=events;
  context.switchView('does-not-exist');
  assert.equal(events,before,'invalid route does not broadcast a view change');
  assert.equal(errors,1);
  assert.equal(context.getView(),allViews.at(-1));
  assert.equal(pages.filter(p=>!p.hidden).length,1);
});
