'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'media/start.js'),'utf8');
const markup=fs.readFileSync(path.join(root,'test/generated/extension-source.txt'),'utf8');
const css=fs.readFileSync(path.join(root,'media/start.css'),'utf8');
const manifest=require('../package.json');

class FakeElement{
 constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this.attributes={};this.dataset={};this.className='';this.textContent='';this.open=false;this.style={};this.handlers={};}
 get isConnected(){return !!this.parentNode;}
 append(...nodes){for(const node of nodes){if(node.parentNode){node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);}node.parentNode=this;this.children.push(node);}}
 remove(){if(this.parentNode){const parent=this.parentNode;parent.children.splice(parent.children.indexOf(this),1);this.parentNode=null;}}
 replaceChildren(...nodes){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...nodes);}
 contains(child){return this.children.some(node=>node===child||node.contains(child));}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(type,cb){this.handlers[type]=cb;}
 querySelector(selector){if(!selector.startsWith('[data-design-kind='))return null;const kind=selector.match(/\[data-design-kind="([^"]+)"\]/)?.[1];return this.children.find(c=>c.dataset.designKind===kind)?.children.find(c=>c.className==='design-kind-detail')||null;}
}
function walk(node){return [node,...node.children.flatMap(walk)];}
function fixture(designs={}){
 const rootNode=new FakeElement('div');const preview=new FakeElement('div');
 const els={designCards:rootNode,designPreview:preview,designStatus:{textContent:''}};
 const functions=ui.slice(ui.indexOf('function renderDesignCards(){'),ui.indexOf('\nfunction openDesignPreview(',ui.indexOf('function renderDesignCards(){')));
 const execute=new Function('env',`const {document,$,designKinds,designExpandedKinds,designState,approvedDesignHash,designSelected,designBusy,designDirty,activeId,designBusyKind,designProcessSnapshot,renderDesignWorkspaceProgress,openDesignPreview,deleteDesign,send,designProcessState,setDesignProcess}=env; const atgvMoreActionsSummary=label=>{const x=document.createElement('summary');x.setAttribute('aria-label','More actions for '+label);return x;}; ${functions};return renderDesignCards;`);
 const sent=[];
 const env={
  document:{createElement:tag=>new FakeElement(tag)},$:id=>els[id],
  designKinds:[['design','Product & UI Design'],['ux','User Experience Flows'],['mockup','Screen Mockups'],['prototype','Interactive UI Prototype'],['architecture','Architecture Diagram'],['api','API Design'],['database','Database Design']],
  designExpandedKinds:new Set(),designState:{revision:1,designs},approvedDesignHash:'hash',designSelected:null,designBusy:false,designDirty:false,activeId:'project',designBusyKind:'',
  designProcessSnapshot:(_,item)=>item?{percent:90,state:'draft',message:'Ready for review'}:{percent:0,state:'idle',message:'Not started'},
  renderDesignWorkspaceProgress:()=>{},openDesignPreview:(...args)=>sent.push(['preview',...args]),deleteDesign:(...args)=>sent.push(['delete',...args]),send:(...args)=>sent.push(args),designProcessState:{},setDesignProcess:()=>{}
 };
 execute(env)();return {els,rootNode,preview,sent};
}

test('one expand/collapse design per activity with a single progress meter',()=>{
 const {rootNode}=fixture();
 const panels=rootNode.children.filter(node=>node.className==='design-kind-panel');
 assert.equal(panels.length,7);
 for(const panel of panels){
  const nodes=walk(panel);
  assert.equal(nodes.filter(node=>node.attributes.role==='progressbar').length,1);
  assert.equal(nodes.filter(node=>node.tagName==='button').length,1);
  assert.equal(nodes.filter(node=>node.tagName==='button')[0].textContent,'Generate Design');
  assert.equal(nodes.filter(node=>node.className.startsWith('design-revisions')).length,0);
 }
});

test('latest revision has one review button and no duplicate browser or history preview',()=>{
 const latest={id:'new',number:2,status:'draft',at:'2026-10-31T00:00:00Z',sourceHash:'hash',design:{title:'Mockup'}};
 const old={...latest,id:'old',number:1,status:'approved'};
 const {rootNode,sent}=fixture({mockup:[old,latest]});
 const panel=rootNode.children.find(node=>node.dataset.designKind==='mockup');
 const buttons=walk(panel).filter(node=>node.tagName==='button');
 assert.deepEqual(buttons.map(b=>b.textContent),['Review Draft','Regenerate','Delete','View Revision','Delete']);
 assert.equal(walk(panel).filter(node=>node.className==='design-revisions').length,1);
 const revisions=walk(panel).find(node=>node.className==='design-revisions');
 assert.equal(revisions.open,false,'revision history must be collapsed by default');
 buttons[0].handlers.click();
 assert.deepEqual(sent[0],['preview','mockup','new']);
 buttons[3].handlers.click();
 assert.deepEqual(sent[1],['preview','mockup','old']);
});

test('review UI has advanced editors collapsed and lifecycle actions visible only when relevant',()=>{
 assert.match(markup,/<details class="design-edit-panel"><summary>Advanced: Structured design \(JSON\)<\/summary>/);
 assert.match(markup,/<details class="design-markdown-panel"><summary>Advanced: Markdown specification<\/summary>/);
 assert.match(ui,/function updateDesignPreviewActions\(item,readonly\)/);
 assert.match(ui,/classList\.toggle\('hidden',!saving\)/);
 assert.match(ui,/classList\.toggle\('hidden',!editAllowed\|\|saving\)/);
 assert.match(ui,/classList\.toggle\('hidden',item\.status!=='approved'\)/);
 assert.match(css,/\.design-revisions\[open\]>summary/);
 assert.equal((ui.match(/document\.createElement\('button'\);browser\./g)||[]).length,0,'no duplicate browser buttons in history');
});

test('release version follows requested rollover convention',()=>{
 assert.equal(manifest.version,'0.3.49');
 assert.equal(manifest.atgvDisplayVersion,'0.3.49');
});
