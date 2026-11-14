 


(function(){'use strict';
const NS='http://www.w3.org/2000/svg';
const make=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));return e};
function bounds(nodes){let x=0,y=0,x2=900,y2=600;if(nodes.length){x=Math.min(...nodes.map(n=>n.x))-55;y=Math.min(...nodes.map(n=>n.y))-55;x2=Math.max(...nodes.map(n=>n.x+n.width))+55;y2=Math.max(...nodes.map(n=>n.y+n.height))+55;}return{x,y,w:Math.max(300,x2-x),h:Math.max(210,y2-y)}}
class AtgvDiagramCanvas{
 constructor(host,model={},opts={}){
  this.host=host;this.model=JSON.parse(JSON.stringify(model));this.opts=opts;this.selected=null;this.linkStart=null;this.changed=false;
  this.view=bounds(this.model.nodes||[]);this.svg=make('svg',{width:'100%',height:'100%',role:'img','aria-label':'AIA interactive diagram. Drag nodes to position, drag background to pan, scroll to zoom.'});this.svg.style.touchAction='none';
  this.host.replaceChildren(this.svg);this.svg.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY>0?1.13:.87)},{passive:false});
  this.svg.addEventListener('pointerdown',e=>this.backgroundPointer(e));this.svg.addEventListener('pointermove',e=>this.pointerMove(e));this.svg.addEventListener('pointerup',e=>this.pointerUp(e));this.svg.addEventListener('pointercancel',e=>this.pointerUp(e));
  this.render();
 }
 serialize(){return JSON.parse(JSON.stringify(this.model))}
 setModel(model){this.model=JSON.parse(JSON.stringify(model));this.selected=null;this.changed=false;this.fit();}
 emit(){this.changed=true;if(this.opts.onChange)this.opts.onChange(this.serialize())}
 pick(id){this.selected=id;this.render();if(this.opts.onSelect)this.opts.onSelect((this.model.nodes||[]).find(n=>n.id===id)||null)}
 zoom(f){const v=this.view;const cx=v.x+v.w/2,cy=v.y+v.h/2;v.w=Math.min(100000,Math.max(90,v.w*f));v.h=Math.min(100000,Math.max(80,v.h*f));v.x=cx-v.w/2;v.y=cy-v.h/2;this.setView()}
 fit(){this.view=bounds(this.model.nodes||[]);this.setView();}
 resize(){this.setView()}
 setView(){this.svg.setAttribute('viewBox',[this.view.x,this.view.y,this.view.w,this.view.h].join(' '))}
 point(e){const r=this.svg.getBoundingClientRect(),v=this.view;return{x:v.x+(e.clientX-r.left)*(v.w/(r.width||1)),y:v.y+(e.clientY-r.top)*(v.h/(r.height||1))}}
 backgroundPointer(e){if(e.button!==0||e.target.closest('[data-node]'))return;this.drag={type:'pan',clientX:e.clientX,clientY:e.clientY,x:this.view.x,y:this.view.y};this.svg.setPointerCapture(e.pointerId)}
 pointerMove(e){if(!this.drag)return;const p=this.point(e);if(this.drag.type==='pan'){const rect=this.svg.getBoundingClientRect();this.view.x=this.drag.x-(e.clientX-this.drag.clientX)*(this.view.w/(rect.width||1));this.view.y=this.drag.y-(e.clientY-this.drag.clientY)*(this.view.h/(rect.height||1));this.setView();return;}if(this.drag.type==='node'){
  const n=this.model.nodes.find(x=>x.id===this.drag.id);if(!n)return;n.x=this.drag.x+p.x-this.drag.start.x;n.y=this.drag.y+p.y-this.drag.start.y;this.drag.moved=true;this.render();
 }}
 pointerUp(e){if(!this.drag)return;const moved=this.drag.type==='node'&&this.drag.moved;this.drag=null;try{if(this.svg.hasPointerCapture(e.pointerId))this.svg.releasePointerCapture(e.pointerId)}catch{}if(moved)this.emit()}
 connect(start,end){if(this.opts.readonly||start===end)return;let n=0,id;do{id='edge'+Date.now().toString(36)+(n++).toString(36)}while(this.model.edges.some(e=>e.id===id));this.model.edges.push({id,from:start,to:end,label:'',kind:'manual'});this.linkStart=null;this.render();this.emit()}
 chooseNode(id,e){e.stopPropagation();if(this.linkStart){this.connect(this.linkStart,id);return;}this.pick(id)}
 addNode(){if(this.opts.readonly)return;let index=1,id;do{id='node'+index++}while(this.model.nodes.some(n=>n.id===id));const v=this.view;this.model.nodes.push({id,key:'',label:'New component',kind:'component',x:v.x+v.w*.4,y:v.y+v.h*.35,width:190,height:75});this.pick(id);this.emit()}
 renameSelected(label){if(this.opts.readonly||!this.selected)return;const node=this.model.nodes.find(n=>n.id===this.selected);if(!node)return;node.label=String(label||'').slice(0,1500);this.render();this.emit()}
 deleteSelected(){if(this.opts.readonly||!this.selected)return;const key=this.selected;this.model.nodes=this.model.nodes.filter(n=>n.id!==key);this.model.edges=this.model.edges.filter(e=>e.from!==key&&e.to!==key);this.pick(null);this.emit()}
 startLink(){if(this.opts.readonly||!this.selected)return;this.linkStart=this.selected;if(this.opts.onLink)this.opts.onLink('Select a target node to connect.');this.render()}
 render(){this.svg.replaceChildren();const nodes=this.model.nodes||[],nodeMap=new Map(nodes.map(n=>[n.id,n]));const root=make('g');this.svg.append(root);
  const defs=make('defs'),marker=make('marker',{id:'atgvArrow',viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'6',markerHeight:'6',orient:'auto-start-reverse'});marker.append(make('path',{d:'M0 0 L10 5 L0 10 Z',fill:'#8b99a8'}));defs.append(marker);root.append(defs);
  for(const e of this.model.edges||[]){const a=nodeMap.get(e.from),b=nodeMap.get(e.to);if(!a||!b)continue;const ax=a.x+a.width/2,ay=a.y+a.height/2,bx=b.x+b.width/2,by=b.y+b.height/2;
   const horizontal=Math.abs(bx-ax)>Math.abs(by-ay)*1.3;
   const sign=horizontal?(bx>=ax?1:-1):(by>=ay?1:-1);
   const sx=horizontal?ax+sign*a.width/2:ax,sy=horizontal?ay:ay+sign*a.height/2;
   const ex=horizontal?bx-sign*b.width/2:bx,ey=horizontal?by:by-sign*b.height/2;
   const d=horizontal?`M ${sx} ${sy} C ${(sx+ex)/2} ${sy} ${(sx+ex)/2} ${ey} ${ex} ${ey}`:`M ${sx} ${sy} C ${sx} ${(sy+ey)/2} ${ex} ${(sy+ey)/2} ${ex} ${ey}`;
   const line=make('path',{d,stroke:'#8b99a8','stroke-width':'1.7',fill:'none','marker-end':'url(#atgvArrow)','stroke-dasharray':e.kind==='logical'?'4 4':''});root.append(line);
   if(e.label){const txt=make('text',{x:(ax+bx)/2,y:(ay+by)/2-7,'text-anchor':'middle','font-size':'10',fill:'currentColor'});txt.textContent=e.label.slice(0,38);root.append(txt)}
  }
  for(const n of nodes){const g=make('g',{'data-node':n.id,role:'button',tabindex:'0','aria-label':n.key?`${n.key}: ${n.label}`:n.label});g.style.cursor='move';
   const selected=this.selected===n.id,fill=n.kind==='epic'?'#8c1839':n.kind==='sdlc'?'#233a58':n.kind==='screen'?'#264c41':'#303a45';
   g.append(make('rect',{x:n.x,y:n.y,width:n.width,height:n.height,rx:7,fill,stroke:selected?'#58d89d':'#8a97a3','stroke-width':selected?3:1.2}));
   const label=String(n.label||'').split(/\n/).flatMap(s=>s.length>45?[s.slice(0,45),s.slice(45,90)]:[s]).slice(0,4);
   const tx=make('text',{x:n.x+10,y:n.y+21,'font-size':12,'font-family':'sans-serif',fill:'#f5f7fa'});label.forEach((l,i)=>{const line=make('tspan',{x:n.x+10,dy:i?17:0});line.textContent=l.length>55?l.slice(0,54)+'…':l;tx.append(line)});g.append(tx);
   const tip=make('title');tip.textContent=n.label;g.append(tip);
   g.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.stopPropagation();if(this.linkStart){this.chooseNode(n.id,e);return;}this.pick(n.id);this.drag={type:'node',id:n.id,start:this.point(e),x:n.x,y:n.y,moved:false};this.svg.setPointerCapture(e.pointerId)});
   g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.chooseNode(n.id,e)}});
   root.append(g);
  }
  this.setView();
 }
}
window.AtgvDiagramCanvas=AtgvDiagramCanvas;
})();
