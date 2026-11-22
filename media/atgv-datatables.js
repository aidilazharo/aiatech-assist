"use strict";
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ATGVDataTables=api;})(typeof window!=='undefined'?window:globalThis,function(){
 const memory=new WeakMap();
 const text=value=>String(value==null?'':value);
 function select(rows,{term='',sortKey='',descending=false,page=1,pageSize=5,pinFirst=null}={}){
  const q=text(term).trim().toLocaleLowerCase();
  const filtered=q?rows.filter(row=>Object.values(row).some(v=>typeof v!=='object'&&text(v).toLocaleLowerCase().includes(q))):[...rows];
  if(sortKey)filtered.sort((a,b)=>{const result=text(a[sortKey]).localeCompare(text(b[sortKey]),undefined,{numeric:true,sensitivity:'base'});return descending?-result:result;});
  if(typeof pinFirst==='function')filtered.sort((a,b)=>Number(Boolean(pinFirst(b)))-Number(Boolean(pinFirst(a))));
  const size=Math.max(1,Math.min(100,Number(pageSize)||5)),pages=Math.max(1,Math.ceil(filtered.length/size));
  const current=Math.max(1,Math.min(pages,Number(page)||1));
  return {rows:filtered.slice((current-1)*size,current*size),filtered:filtered.length,total:rows.length,pages,page:current};
 }
 function mount(container,rows,columns,options={}){
  if(!container||!Array.isArray(rows)||!Array.isArray(columns)||!columns.length)throw Error('A DataTable requires rows, columns and a container.');
  const doc=container.ownerDocument||document;
  let state=memory.get(container)||{term:'',sortKey:options.sortKey||'',descending:false,page:1,pageSize:5};
  state.pageSize=Math.max(1,Math.min(100,Number(options.pageSize)||state.pageSize));
  state.rows=rows;state.columns=columns;state.pinFirst=typeof options.pinFirst==='function'?options.pinFirst:null;
  memory.set(container,state);
  container.replaceChildren();container.classList.add('atgv-datatable');
  const bar=doc.createElement('div');bar.className='atgv-datatable-controls';
  const search=doc.createElement('input');search.type='search';search.className='atgv-datatable-search';search.placeholder='Search records';search.setAttribute('aria-label','Search '+(options.label||'records'));search.value=state.term;
  const count=doc.createElement('span');count.className='atgv-datatable-count';count.setAttribute('role','status');count.setAttribute('aria-live','polite');
  bar.append(search,count);
  const overflow=doc.createElement('div');overflow.className='atgv-datatable-scroll';
  const table=doc.createElement('table');table.className='atgv-datatable-table';table.setAttribute('aria-label',options.label||'Records');
  const thead=doc.createElement('thead'),tr=doc.createElement('tr');
  for(const column of columns){const th=doc.createElement('th');th.scope='col';if(column.sortable===false)th.textContent=column.label;else{const sort=doc.createElement('button');sort.type='button';sort.className='atgv-datatable-sort';sort.textContent=column.label;sort.addEventListener('click',()=>{state.descending=state.sortKey===column.key?!state.descending:false;state.sortKey=column.key;state.page=1;render();});th.append(sort);}tr.append(th);}thead.append(tr);
  const tbody=doc.createElement('tbody');table.append(thead,tbody);overflow.append(table);
  const pager=doc.createElement('div');pager.className='atgv-datatable-pager';
  const prev=doc.createElement('button');prev.type='button';prev.className='secondary';prev.textContent='Previous';
  const next=doc.createElement('button');next.type='button';next.className='secondary';next.textContent='Next';
  const number=doc.createElement('span');number.className='muted';number.setAttribute('aria-live','polite');
  prev.addEventListener('click',()=>{state.page--;render();});next.addEventListener('click',()=>{state.page++;render();});pager.append(prev,number,next);
  container.append(bar,overflow,pager);
  function render(){const result=select(state.rows,options.preserveOrder?{...state,sortKey:''}:state);state.page=result.page;tbody.replaceChildren();
   for(const item of result.rows){const row=doc.createElement('tr');
    if(typeof options.onRowClick==='function'){
      row.classList.add('atgv-datatable-clickable-row');row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label','View '+String(item.key||item.summary||'record')+' details');
      row.addEventListener('click',event=>{if(event.target.closest?.('button,a,input,select,textarea'))return;options.onRowClick(item);});
      row.addEventListener('keydown',event=>{if(event.target!==row)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();options.onRowClick(item);}});
    }
    for(const col of columns){const cell=doc.createElement('td');const rendered=typeof col.render==='function'?col.render(item,doc):text(item[col.key]);if(rendered&&typeof rendered==='object'&&typeof rendered.nodeType==='number')cell.append(rendered);else cell.textContent=text(rendered);row.append(cell);}tbody.append(row);}
   if(!result.rows.length){const row=doc.createElement('tr'),cell=doc.createElement('td');cell.colSpan=columns.length;cell.className='muted';cell.textContent='No matching records.';row.append(cell);tbody.append(row);}
   for(const [idx,col] of columns.entries())thead.children[0].children[idx].setAttribute('aria-sort',!options.preserveOrder&&state.sortKey===col.key?(state.descending?'descending':'ascending'):'none');
   count.textContent=result.filtered+' of '+result.total+' records';number.textContent='Page '+result.page+' of '+result.pages;prev.disabled=result.page<=1;next.disabled=result.page>=result.pages;
  }
  search.addEventListener('input',()=>{state.term=search.value;state.page=1;render();});render();return {refresh:render,setRows(nextRows){if(!Array.isArray(nextRows))throw Error('DataTable rows must be an array.');state.rows=nextRows;render();}};
 }
 return {mount,select};
});
