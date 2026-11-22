'use strict';
// Safe, dependency-free ISO BRD document viewer for the VS Code webview.
// All user-controlled document text is inserted through text nodes, never innerHTML.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVDocumentViewer=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const heading=/^(#{1,6})\s+(.+?)\s*#*\s*$/;
 const list=/^\s{0,3}([-*+] |\d+[.)] )(.+)$/;
 const divider=/^\s*(?:---+|\*\*\*+|___+)\s*$/;
 const separator=/^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/;
 const requirement=/^(?:\d+(?:\.\d+)*\s+)?(?:FR|NFR|BR|REQ|AC|US|F)-[A-Z0-9._-]+\b/i;
 function linesOf(value){return String(value??'').replace(/\r\n?/g,'\n').split('\n');}
 function splitCells(line){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());}
 function inline(doc,container,text){
  const re=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g;
  let index=0;const source=String(text||'');
  for(const match of source.matchAll(re)){
   if(match.index>index)container.append(doc.createTextNode(source.slice(index,match.index)));
   const part=match[0];let el;
   if(part.startsWith('`')){el=doc.createElement('code');el.textContent=part.slice(1,-1);}
   else if(part.startsWith('**')){el=doc.createElement('strong');el.textContent=part.slice(2,-2);}
   else if(part.startsWith('*')){el=doc.createElement('em');el.textContent=part.slice(1,-1);}
   else{
    const m=/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(part);
    el=doc.createElement('a');el.textContent=m[1];el.href=m[2];el.target='_blank';el.rel='noopener noreferrer';
   }
   container.append(el);index=match.index+part.length;
  }
  if(index<source.length)container.append(doc.createTextNode(source.slice(index)));
 }
 function render(container,markdown){
  if(!container||!container.ownerDocument)throw Error('The BRD viewer requires a document container.');
  const doc=container.ownerDocument,lines=linesOf(markdown);
  container.replaceChildren();container.classList.add('ba-document-viewer');
  if(!String(markdown||'').trim()){
   const empty=doc.createElement('p');empty.className='muted';empty.textContent='No structured Business Requirements available.';container.append(empty);
   return {blocks:0,sections:0};
  }
  let i=0,blocks=0,sections=0,section=null,sectionDepth=7;
  const emit=node=>{(section||container).append(node);blocks++;};
  const isBoundary=line=>heading.test(line)||divider.test(line)||list.test(line)||/^\s*> /.test(line)||/^\s*```/.test(line);
  while(i<lines.length){
   const line=lines[i];if(!line.trim()){i++;continue;}
   const h=heading.exec(line);
   if(h){
    const level=h[1].length,title=h[2].trim();
    if(section&&level<=sectionDepth){section=null;sectionDepth=7;}
    if(level>=3&&requirement.test(title)){
     const details=doc.createElement('details');details.className='ba-document-viewer-requirement';
     const summary=doc.createElement('summary');inline(doc,summary,title);details.append(summary);
     (section||container).append(details);section=details;sectionDepth=level;sections++;blocks++;
    }else{
     const el=doc.createElement('h'+level);inline(doc,el,title);emit(el);sections++;
    }
    i++;continue;
   }
   if(/^\s*```/.test(line)){
    const code=doc.createElement('pre'),text=doc.createElement('code');const values=[];
    for(i++;i<lines.length&&!/^\s*```/.test(lines[i]);i++)values.push(lines[i]);
    if(i<lines.length)i++;
    text.textContent=values.join('\n');code.append(text);emit(code);continue;
   }
   if(divider.test(line)){emit(doc.createElement('hr'));i++;continue;}
   if(i+1<lines.length&&line.includes('|')&&separator.test(lines[i+1])){
    const columns=splitCells(line),table=doc.createElement('table');
    const thead=doc.createElement('thead'),tr=doc.createElement('tr');
    for(const cell of columns){const th=doc.createElement('th');th.scope='col';inline(doc,th,cell);tr.append(th);}
    thead.append(tr);table.append(thead);const tbody=doc.createElement('tbody');i+=2;
    for(;i<lines.length&&lines[i].trim()&&lines[i].includes('|');i++){
     const tr=doc.createElement('tr'),cells=splitCells(lines[i]);
     for(let j=0;j<columns.length;j++){const td=doc.createElement('td');inline(doc,td,cells[j]||'');tr.append(td);}
     tbody.append(tr);
    }
    table.append(tbody);const wrap=doc.createElement('div');wrap.className='ba-document-viewer-table';wrap.append(table);emit(wrap);continue;
   }
   const match=list.exec(line);
   if(match){
    const ordered=/^\d/.test(match[1]),items=doc.createElement(ordered?'ol':'ul');
    while(i<lines.length){
     const m=list.exec(lines[i]);if(!m||/^\d/.test(m[1])!==ordered)break;
     const item=doc.createElement('li');inline(doc,item,m[2]);items.append(item);i++;
    }
    emit(items);continue;
   }
   if(/^\s*>\s?/.test(line)){
    const quote=doc.createElement('blockquote'),text=[];
    while(i<lines.length&&/^\s*>\s?/.test(lines[i]))text.push(lines[i++].replace(/^\s*>\s?/,''));inline(doc,quote,text.join(' '));emit(quote);continue;
   }
   const paragraph=doc.createElement('p'),parts=[line.trim()];i++;
   while(i<lines.length&&lines[i].trim()&&!isBoundary(lines[i])&&!(i+1<lines.length&&lines[i].includes('|')&&separator.test(lines[i+1]))){
    parts.push(lines[i].trim());i++;
   }
   inline(doc,paragraph,parts.join(' '));emit(paragraph);
  }
  return {blocks,sections};
 }
 return {render,splitCells};
});
