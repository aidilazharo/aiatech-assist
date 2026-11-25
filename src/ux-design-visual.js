'use strict';
// Deterministic, safe SVG screen images from a validated AI screen specification.
// These are editable review mockups/wireframes, never photographs or screenshots.
const repositoryStyle=require('./repository-design-style');
const palette={
 wireframe:{bg:'#edf1f5',frame:'#ffffff',top:'#dbe2ea',line:'#b5bfcd',ink:'#243346',muted:'#667487',accent:'#687c94',soft:'#f1f4f8',chip:'#dee6ee'},
 mockup:{bg:'#e8eef7',frame:'#ffffff',top:'#17283d',line:'#d7e1ee',ink:'#1b2b40',muted:'#60758b',accent:'#2765d8',soft:'#f4f7fc',chip:'#e3edff'}
};
function xml(value){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function shorten(value,n=60){const s=String(value||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1).trimEnd()+'…':s;}
function label(component){const s=String(component||'').replace(/^[-•\d.)\s]+/,'').trim();const head=s.split(/\s*[.:—]\s*/)[0].trim();return shorten(head||s,54);}
function kindOf(text){const s=String(text||'').toLowerCase();
 if(/(?:table|grid|list of|results|records|rows|inventory|history)/.test(s))return 'table';
 if(/(?:search|filter|lookup)/.test(s))return 'search';
 if(/(?:select|dropdown|combo|picker|choose|option)/.test(s))return 'select';
 if(/(?:button|submit|continue|save|cancel|next|confirm|primary action|call.to.action)/.test(s))return 'button';
 if(/(?:status|alert|message|success|error|empty state|notification|badge)/.test(s))return 'status';
 if(/(?:attachment|upload|photo|image|media|thumbnail)/.test(s))return 'upload';
 if(/(?:card|tile|summary|metric)/.test(s))return 'card';
 if(/(?:header|breadcrumb|menu|navigation|sidebar|toolbar)/.test(s))return 'nav';
 return 'field';
}
const rect=(x,y,w,h,fill,stroke='',r=8)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke?` stroke="${stroke}" stroke-width="1"`:''}/>`;
const text=(x,y,value,size=15,color='#243346',weight=400)=>`<text x="${x}" y="${y}" fill="${color}" font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="${size}" font-weight="${weight}">${xml(value)}</text>`;
// Deliberately unstyled structural sketch: monochrome shapes, crossed placeholders,
// gray content bars and simple boxes. Never reuse the high-fidelity mockup palette.
function wireframeSvg(screen,opts={}){
 const name=shorten(screen.name||'Screen',55),key=shorten(opts.key||'JIRA',22);
 const components=(screen.components||[]).slice(0,10).map(c=>({label:label(c),type:kindOf(c)}));
 const b=['<svg xmlns="http://www.w3.org/2000/svg" width="1060" height="680" viewBox="0 0 1060 680" role="img" aria-label="'+xml(name)+' low-fidelity wireframe">'];
 const box=(x,y,w,h,fill='#fff',stroke='#595959')=>b.push(rect(x,y,w,h,fill,stroke,0));
 const line=(x1,y1,x2,y2,col='#666')=>b.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.5"/>`);
 const words=(x,y,value,size=13,weight=400)=>b.push(text(x,y,shorten(value,49),size,'#292929',weight));
 const placeholder=(x,y,w,h)=>{box(x,y,w,h,'#f7f7f7','#666');line(x+3,y+3,x+w-3,y+h-3);line(x+w-3,y+3,x+3,y+h-3);};
 b.push(rect(0,0,1060,680,'#fff','',0));box(15,12,1030,656,'#fff','#444');
 box(15,12,1030,32,'#dedede','#555');words(492,34,'WIREFRAME · '+key,14,600);
 for(let i=0;i<3;i++)box(31+i*23,52,16,17,'#fafafa');
 box(115,49,916,24,'#fff');words(128,66,'Page / '+name,12);
 box(28,88,1004,68,'#eee');placeholder(44,101,106,42);box(177,107,342,28,'#fff');words(192,126,'Search…',12);
 for(let i=0;i<3;i++){box(765+i*82,110,73,24,'#f8f8f8');words(776+i*82,127,['Action','User','Menu'][i],11);}
 box(28,171,170,473,'#ededed');
 const nav=['Home','My Work','Requests','History','Settings'];
 nav.forEach((value,i)=>{box(44,190+i*60,138,43,i===1?'#ddd':'#fff');words(59,215+i*60,value,13);});
 words(218,193,'SCREEN STRUCTURE  /  '+name,16,650);
 line(218,206,1016,206,'#aaa');
 const items=components.length?components:[{label:'Main content',type:'card'},{label:'Primary action',type:'button'}];
 items.forEach((item,i)=>{
  const col=i%2,row=Math.floor(i/2),x=220+col*404,y=225+row*80,w=374,h=68;
  if(y+h>630)return;
  words(x+8,y+13,item.label,12,600);
  if(['upload','card'].includes(item.type)){placeholder(x+8,y+20,128,42);for(let k=0;k<2;k++)box(x+149,y+23+k*18,Math.max(85,185-k*32),9,'#aaa','#aaa');}
  else if(item.type==='table'){box(x+8,y+20,355,43,'#fff');for(let k=1;k<=3;k++)line(x+8,y+20+k*10,x+363,y+20+k*10,'#aaa');for(let k=1;k<=3;k++)line(x+8+k*88,y+20,x+8+k*88,y+63,'#aaa');}
  else if(item.type==='button'){box(x+8,y+24,170,34,'#eee');words(x+20,y+45,'[ '+shorten(item.label,17)+' ]',12,500);}
  else if(item.type==='nav'){for(let k=0;k<3;k++){box(x+8+k*121,y+24,110,33,'#f2f2f2');words(x+15+k*121,y+45,k===0?shorten(item.label,13):'Section',11);}}
  else if(item.type==='status'){box(x+8,y+24,355,33,'#eee');box(x+17,y+33,18,15,'#bbb');box(x+45,y+36,230,8,'#aaa','#aaa');}
  else {box(x+8,y+24,355,32,'#fff');if(item.type==='select')words(x+336,y+46,'⌄',16);else if(item.type==='search')words(x+21,y+45,'Search…',11);}
 });
 words(31,662,'LOW-FIDELITY SKETCH   •   LAYOUT AND STRUCTURE ONLY',11,550);
 b.push('</svg>');return b.join('');
}
function screenSvg(screen,opts={}){
 if(opts.kind==='wireframe')return wireframeSvg(screen,opts);
 const type=opts.kind==='wireframe'?'wireframe':'mockup',p=opts.repositorySource?.hasDesign?repositoryStyle.palette(opts.repositorySource):palette[type],key=shorten(opts.key||'JIRA',18),title=shorten(screen.name||'New screen',54),purpose=shorten(screen.purpose||'Interactive design draft',92);
 const comps=(screen.components||[]).slice(0,12).map(c=>({text:label(c),type:kindOf(c)}));
 const w=1060,h=680,b=[];
 b.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${xml(title)} design preview">`);
 b.push(rect(0,0,w,h,p.bg,'',0));b.push(rect(30,25,1000,628,p.frame,p.line,14));
 b.push(rect(30,25,1000,66,p.top,'',14));b.push(rect(30,78,1000,13,p.top,'',0));
 for(let i=0;i<3;i++)b.push(`<circle cx="${55+i*18}" cy="57" r="5" fill="${type==='wireframe'?p.muted:['#fd717b','#ffbf4e','#4cc38a'][i]}" opacity=".75"/>`);
 b.push(text(128,62,type==='wireframe'?'WIREFRAME  /  '+key:'ATGV  /  '+key,13,opts.repositorySource?.hasDesign?repositoryStyle.contrast(p.top):type==='wireframe'?p.ink:'#d8e6fa',650));
 b.push(text(874,62,type==='wireframe'?'LOW FIDELITY':'DESIGN DRAFT',12,opts.repositorySource?.hasDesign?repositoryStyle.contrast(p.top):type==='wireframe'?p.muted:'#d8e6fa',550));
 b.push(rect(48,109,213,520,p.soft,'',9));b.push(text(70,143,'WORKSPACE',13,p.muted,650));
 const nav=opts.repositorySource?.hasDesign?(opts.screenNames||[title]).slice(0,5).map(n=>shorten(n,22)):['Overview','Requests','My work','Approvals','Settings'];
 nav.forEach((name,i)=>{const y=166+i*54;if(i===1)b.push(rect(60,y-25,188,43,p.chip,'',7));b.push(`<circle cx="78" cy="${y-6}" r="7" fill="${i===1?p.accent:p.line}"/>`);b.push(text(98,y,name,15,i===1?p.ink:p.muted,i===1?660:430));});
 b.push(text(295,140,title,25,p.ink,720));b.push(text(295,171,purpose,13,p.muted));
 b.push(rect(294,193,710,417,p.frame,p.line,10));
 const innerX=318,bodyW=660,rowH=57;let currentY=215;
 b.push(text(innerX,234,'DETAILS',12,p.muted,650));currentY=250;
 const visual=comps.length?comps:[{text:'Request details',type:'field'},{text:'Select an item',type:'select'},{text:'Continue',type:'button'}];
 const maxRows=Math.min(6,visual.length);let shown=0;
 for(let i=0;i<visual.length&&shown<maxRows;i++){
  const c=visual[i],x=innerX,y=currentY;
  const estimate=c.type==='table'?98:c.type==='card'?70:c.type==='nav'?42:c.type==='status'||c.type==='button'?53:c.type==='upload'?60:rowH;
  if(y+estimate>600)break;shown++;
  if(c.type==='nav'){b.push(text(x,y+11,shorten(c.text,70),14,p.ink,650));currentY+=42;continue;}
  if(c.type==='table'){
   b.push(text(x,y+6,shorten(c.text,78),13,p.ink,600));b.push(rect(x,y+18,650,58,p.soft,p.line,5));
   for(let j=1;j<4;j++)b.push(`<line x1="${x+j*161}" y1="${y+19}" x2="${x+j*161}" y2="${y+76}" stroke="${p.line}"/>`);
   b.push(`<line x1="${x}" y1="${y+46}" x2="${x+649}" y2="${y+46}" stroke="${p.line}"/>`);currentY+=98;continue;
  }
  if(c.type==='status'){b.push(rect(x,y,648,41,p.chip,p.line,6));b.push(`<circle cx="${x+21}" cy="${y+21}" r="7" fill="${p.accent}"/>`);b.push(text(x+38,y+26,shorten(c.text,80),13,p.ink));currentY+=53;continue;}
  if(c.type==='card'){b.push(rect(x,y,318,60,p.soft,p.line,7));b.push(text(x+15,y+36,c.text,13,p.ink,600));currentY+=70;continue;}
  if(c.type==='button'){b.push(rect(x,y,Math.min(350,Math.max(185,c.text.length*10+28)),41,p.accent,'',7));b.push(text(x+17,y+26,c.text,14,opts.repositorySource?.hasDesign?repositoryStyle.contrast(p.accent):'#ffffff',620));currentY+=53;continue;}
  if(c.type==='upload'){b.push(rect(x,y,648,48,p.soft,p.line,7));b.push(text(x+18,y+29,'+   '+c.text,13,p.muted));currentY+=60;continue;}
  b.push(text(x,y+3,shorten(c.text,62),13,p.ink,600));b.push(rect(x,y+13,648,35,p.frame,p.line,6));
  if(c.type==='select')b.push(text(x+625,y+37,'⌄',20,p.muted));else if(c.type==='search')b.push(text(x+18,y+36,'Search…',12,p.muted));
  currentY+=rowH;
 }
 if(visual.length>shown)b.push(text(innerX,Math.min(589,currentY+10),`+ ${visual.length-shown} more design components`,12,p.muted));
 b.push(text(47,651,`${type==='wireframe'?'Wireframe':'Mockup'}  ·  draft for human review`,12,p.muted));
 b.push(text(825,651,'NOT AN APPROVED SCREEN',11,p.muted,600));
 b.push('</svg>');return b.join('');
}
function renderScreens(design,kind,key,repositorySource){const screens=(design?.screens||[]).slice(0,12);return screens.map((screen,i)=>({name:String(screen.name||`Screen ${i+1}`),index:i+1,svg:screenSvg(screen,{kind,key,repositorySource,screenNames:screens.map(s=>String(s.name||'Screen'))})}));}
function svgName(kind,revisionNumber,screen){const safe=kind==='wireframe'?'wireframe':'mockup';return `${safe}-r${Math.max(1,Number(revisionNumber)||1)}-screen-${String(screen).padStart(2,'0')}.svg`;}
module.exports={xml,shorten,kindOf,screenSvg,renderScreens,svgName};
