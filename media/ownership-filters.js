(function(root){
 function ownerStatus(record,me){
  if(record.pending?.to===me&&me)return 'requested-by-me';
  if(record.pending?.from===me&&me)return 'awaiting-me';
  if(record.pending)return 'pending';
  if(!record.ownerId)return 'unassigned';
  return me&&record.ownerId===me?'mine':'other';
 }
 function filterOwnershipRows(rows,filters,me){
  const name=String(filters.document||'').trim().toLocaleLowerCase();
  const username=String(filters.username||'').trim().toLocaleLowerCase();
  const from=String(filters.from||'');const to=String(filters.to||'');
  return rows.filter(row=>{
   if(filters.role&&row.role!==filters.role)return false;
   if(filters.status&&(filters.status==='pending'?!row.pending:ownerStatus(row,me)!==filters.status))return false;
   if(name&&!`${row.label} ${row.documentId}`.toLocaleLowerCase().includes(name))return false;
   if(username&&!`${row.ownerId||''} ${row.pending?.to||''} ${row.pending?.from||''} ${row.ownerName||''} ${row.pending?.toName||''}`.toLocaleLowerCase().includes(username))return false;
   const date=String(row.updatedAt||row.pending?.requestedAt||'').slice(0,10);
   if(from&&(!date||date<from))return false;
   if(to&&(!date||date>to))return false;
   return true;
  }).sort((a,b)=>String(b.updatedAt||b.pending?.requestedAt||'').localeCompare(String(a.updatedAt||a.pending?.requestedAt||''))||a.label.localeCompare(b.label));
 }
 const api={ownerStatus,filterOwnershipRows};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ATGVOwnershipFilters=api;
})(typeof globalThis==='object'?globalThis:this);
