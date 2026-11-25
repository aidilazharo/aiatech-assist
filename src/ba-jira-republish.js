'use strict';

const root=path=>String(path||'').split('/')[0];
const normal=name=>String(name||'').toLowerCase().trim().replace(/[\s_-]+/g,'');
const isToDo=name=>normal(name)==='todo';

function shouldReopen(status){
 return !!status?.name&&!isToDo(status.name);
}

/** Plan a status reset only for verified links of BRs that actually changed. */
async function preview(register,roots,{read,transitions,verify,retiring=[]}){
 const included=new Set(roots),exclude=new Set(retiring),rows=[],blocked=[],skipped=[];
 for(const [path,link] of Object.entries(register.synced||{})){
  if(!included.has(root(path))||exclude.has(path)||!link?.key)continue;
  try{
   const issue=await read(link.key);
   verify(path,issue);
   const status=issue.fields?.status;
   if(!shouldReopen(status)){
    if(!status?.name)blocked.push(link.key+' returned no Jira status.');
    continue;
   }
   const options=(await transitions(link.key)).filter(item=>isToDo(item.to));
   const transition=options.find(item=>String(item.id)===register.baPendingReopen?.rows?.find(row=>row.path===path)?.transitionId)||options[0];
   if(!transition){skipped.push({path,key:link.key,from:status.name,statusId:String(status.id||''),assigneeId:String(issue.fields?.assignee?.accountId||''),message:link.key+' has no available transition to To Do from '+status.name+'. Publish the requirement changes and retain the current status and assignee.'});continue;}
   rows.push({path,key:link.key,from:status.name,statusId:String(status.id||''),to:transition.to,transitionId:String(transition.id),assigneeId:String(issue.fields?.assignee?.accountId||'')});
  }catch(error){blocked.push(link.key+' could not be verified for republish. '+String(error.message||error).slice(0,200));}
 }
 return {rows,blocked,skipped};
}

async function apply(row,{read,transitions,verify,move}){
 const live=await read(row.key);
 verify(row.path,live);
 const status=live.fields?.status;
 if(Object.hasOwn(row,'assigneeId')&&String(live.fields?.assignee?.accountId||'')!==row.assigneeId)throw Error(row.key+' assignee changed after preview. Refresh Jira preview.');
 const owner=String(live.fields?.assignee?.accountId||'');
 if(isToDo(status?.name))return;
 if(!shouldReopen(status)||String(status.id||'')!==row.statusId||status.name!==row.from)
  throw Error(row.key+' changed status after preview. Refresh the Jira preview.');
 const transition=(await transitions(row.key)).find(value=>String(value.id)===row.transitionId&&isToDo(value.to));
 if(!transition)throw Error(row.key+' can no longer transition to To Do.');
 await move(row.key,transition.id,live.fields.updated);
 const confirmed=await read(row.key);
 verify(row.path,confirmed);
 if(String(confirmed.fields?.assignee?.accountId||'')!==owner)throw Error('Jira assignee changed during status reset for '+row.key+'. Review ownership.');
 if(!isToDo(confirmed.fields?.status?.name))throw Error('Jira did not confirm To Do for '+row.key+'.');
}

module.exports={shouldReopen,preview,apply};
