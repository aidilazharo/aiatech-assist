'use strict';
// Project Manager Kanban. Optional SortableJS comes from the verified SDLC Library
// asset cache; native HTML drag-and-drop remains available without it.
// Jira remains authoritative for issue workflow status and permitted transitions.
(function(root){
  let sorters=[];
  function element(tag,cls,text){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  function destroySorters(){
    for(const sortable of sorters){try{sortable.destroy();}catch{/* Detached webview. */}}
    sorters=[];
  }
  function render(container,items,{onOpen=()=>{},onMove=()=>{},busy=false}={}){
    if(!container)return;
    destroySorters();
    container.replaceChildren();
    const all=Array.isArray(items)?items.filter(item=>item&&/^[A-Z][A-Z0-9_]+-\d+$/.test(item.key)):[];
    const rows=all.slice(0,500); // Bound the card DOM for large Jira projects.
    const defaults=['To Do','In Progress','In Review','Done'];
    const names=[...defaults,...new Set(rows.map(item=>String(item.status||'Unknown')))]
      .filter((name,index,array)=>array.findIndex(v=>v.toLowerCase()===name.toLowerCase())===index);
    const board=element('div','atgv-kanban-board'), lists=[];
    const Sortable=root.Sortable;
    const hasSortable=!!Sortable&&typeof Sortable.create==='function';
    for(const name of names){
      const column=element('section','atgv-kanban-column');
      column.setAttribute('aria-label',name+' Jira issues');
      const count=rows.filter(item=>String(item.status||'Unknown').toLowerCase()===name.toLowerCase()).length;
      const head=element('h4','atgv-kanban-heading',name+' · '+count);
      const list=element('div','atgv-kanban-cards');
      list.dataset.status=name;
      lists.push(list);
      if(!hasSortable){
        // Native HTML5 fallback if the locally bundled resource fails to load.
        list.addEventListener('dragover',event=>{
          if(!busy){event.preventDefault();event.dataTransfer.dropEffect='move';}
        });
        list.addEventListener('drop',event=>{
          if(busy)return;
          event.preventDefault();
          const key=event.dataTransfer.getData('text/atgv-jira');
          const item=rows.find(x=>x.key===key);
          if(item&&item.status.toLowerCase()!==name.toLowerCase())onMove(item,name);
        });
      }
      for(const item of rows.filter(x=>String(x.status||'Unknown').toLowerCase()===name.toLowerCase())){
        const card=element('article','atgv-kanban-card');
        card.dataset.key=item.key;
        card.draggable=!busy&&!hasSortable;
        if(!hasSortable)card.addEventListener('dragstart',event=>{
          event.dataTransfer.setData('text/atgv-jira',item.key);
        });
        const link=element('button','atgv-kanban-key',item.key);
        link.type='button';link.title='Open '+item.key;
        link.addEventListener('click',()=>onOpen(item));
        const grip=element('span','atgv-kanban-grip','⠿');
        grip.setAttribute('aria-hidden','true');
        grip.title='Drag to another Jira status';
        const top=element('div','atgv-kanban-card-head');
        top.append(link,grip);
        card.append(top,element('div','atgv-kanban-summary',item.summary||'Untitled Jira issue'));
        card.append(element('small','atgv-kanban-meta',(item.assignee||'Unassigned')+' · '+(item.type||'Issue')));
        const select=element('select','atgv-kanban-move');select.disabled=busy;
        select.setAttribute('aria-label','Change Jira status for '+item.key);
        for(const target of names){const option=element('option','',target);option.value=target;select.append(option);}
        select.value=name;
        select.addEventListener('change',()=>{
          const target=select.value;select.value=name;
          if(!busy&&target!==name)onMove(item,target);
        });
        card.append(select);list.append(card);
      }
      column.append(head,list);board.append(column);
    }
    if(all.length>rows.length)container.append(element('p','atgv-kanban-meta','Showing '+rows.length+' of '+all.length+' issues. Use the Jira table to find other items.'));
    container.append(board);
    if(hasSortable){
      for(const list of lists){
        const sortable=Sortable.create(list,{
          group:{name:'atgv-jira-kanban',pull:true,put:true},
          sort:false, // Jira has no durable Kanban rank; status moves only.
          animation:150,
          draggable:'.atgv-kanban-card',
          handle:'.atgv-kanban-grip',
          ghostClass:'atgv-kanban-ghost',
          chosenClass:'atgv-kanban-chosen',
          dragClass:'atgv-kanban-drag',
          fallbackTolerance:4,
          disabled:busy,
          onEnd:event=>{
            if(busy)return;
            const key=event.item?.dataset?.key;
            const to=event.to?.dataset?.status;
            const item=rows.find(x=>x.key===key);
            if(item&&to&&item.status.toLowerCase()!==to.toLowerCase()){
              // The host validates Jira permissions, asks for confirmation, and
              // refreshes authoritative statuses; no local mutation is persisted.
              onMove(item,to);
            }
          }
        });
        sorters.push(sortable);
      }
    }
  }
  const api=Object.freeze({render,destroy:destroySorters});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ATGVKanban=api;
})(typeof window!=='undefined'?window:globalThis);
