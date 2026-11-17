'use strict';
// ATGV Kanban: dependency-free native drag/drop, no external JS or CDN.
// Jira remains authoritative; the host validates transitions and confirms writes.
(function(root){
  function element(tag,cls,text){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function render(container,items,{onOpen=()=>{},onMove=()=>{},busy=false}={}){
    if(!container)return;
    container.replaceChildren();
    const rows=Array.isArray(items)?items.filter(item=>item&&/^[A-Z][A-Z0-9_]+-\d+$/.test(item.key)):[]; 
    const defaults=['To Do','In Progress','In Review','Done'];
    const names=[...defaults,...new Set(rows.map(item=>String(item.status||'Unknown')))]
      .filter((name,index,array)=>array.findIndex(v=>v.toLowerCase()===name.toLowerCase())===index);
    const board=element('div','atgv-kanban-board');
    for(const name of names){
      const column=element('section','atgv-kanban-column');
      column.setAttribute('aria-label',name+' Jira issues');
      const head=element('h4','atgv-kanban-heading',name+' · '+rows.filter(item=>String(item.status||'Unknown').toLowerCase()===name.toLowerCase()).length);
      const list=element('div','atgv-kanban-cards');list.dataset.status=name;
      list.addEventListener('dragover',event=>{if(!busy){event.preventDefault();event.dataTransfer.dropEffect='move';}});
      list.addEventListener('drop',event=>{
        if(busy)return;
        event.preventDefault();
        const key=event.dataTransfer.getData('text/atgv-jira');
        const item=rows.find(x=>x.key===key);
        if(item&&item.status.toLowerCase()!==name.toLowerCase())onMove(item,name);
      });
      for(const item of rows.filter(x=>String(x.status||'Unknown').toLowerCase()===name.toLowerCase())){
        const card=element('article','atgv-kanban-card');
        card.draggable=!busy;card.dataset.key=item.key;
        card.addEventListener('dragstart',event=>event.dataTransfer.setData('text/atgv-jira',item.key));
        const link=element('button','atgv-kanban-key',item.key);
        link.type='button';link.title='Open '+item.key;link.addEventListener('click',()=>onOpen(item));
        card.append(link,element('div','atgv-kanban-summary',item.summary||'Untitled Jira issue'));
        const meta=element('small','atgv-kanban-meta',(item.assignee||'Unassigned')+' · '+(item.type||'Issue'));
        card.append(meta);
        const select=element('select','atgv-kanban-move');select.disabled=busy;
        select.setAttribute('aria-label','Change Jira status for '+item.key);
        for(const target of names){const option=element('option','',target);option.value=target;select.append(option);}
        select.value=name;
        select.addEventListener('change',()=>{const target=select.value;select.value=name;if(target!==name)onMove(item,target);});
        card.append(select);list.append(card);
      }
      column.append(head,list);board.append(column);
    }
    container.append(board);
  }
  const api=Object.freeze({render});if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ATGVKanban=api;
})(typeof window!=='undefined'?window:globalThis);
