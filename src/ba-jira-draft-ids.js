'use strict';

const {epicName}=require('./jira-duplicate-cleanup');

const root=path=>String(path||'').split('/')[0];
const number=id=>Number(String(id||'').match(/^BR-(\d+)$/i)?.[1])||0;

function canRenumber(register,id){
 const br=(register.brs||[]).find(row=>row.id===id);
 if(!br||br.status!=='draft'||br.archivedFromRestart||br.approvedContent||br.approvedRevision||br.approvedRevisions?.length)return false;
 const reserved=[register.synced,register.pending,register.links,register.roleTaskMappings,register.roleTaskPending];
 if(reserved.some(index=>Object.keys(index||{}).some(path=>root(path)===id)))return false;
 if((register.completedIndex||[]).some(row=>row.id===id)||(register.completedCycles||[]).some(cycle=>cycle.requirements?.some(row=>row.id===id)))return false;
 if((register.changeQueue||[]).some(row=>row.targetIds?.some(path=>root(path)===id)))return false;
 return !(register.changeRequests||[]).some(row=>row.paths?.some(path=>root(path)===id));
}

function similar(a,b){
 const left=new Set(epicName(a).split(' ').filter(word=>word.length>2));
 const right=new Set(epicName(b).split(' ').filter(word=>word.length>2));
 if(!left.size||!right.size)return true;
 return [...left].filter(word=>right.has(word)).length/Math.min(left.size,right.size)>=.5;
}

function plan(register,changes,inventory,marker){
 const epics=[],byMarker=new Map();
 let next=Math.max(0,register.lastBrSequence||0,...(register.brs||[]).map(row=>number(row.id)));
 for(const issue of inventory){
  if(/^epic$/i.test(issue.fields?.issuetype?.name||'')){
   epics.push(issue);
   const id=String(issue.fields.summary||'').match(/^\s*(BR-\d+)\b/i)?.[1];
   const observed=number(id);
   if(Number.isSafeInteger(observed))next=Math.max(next,observed);
  }
  for(const label of issue.fields?.labels||[]){
   if(!/^atgv-[a-f0-9]{24}$/.test(label))continue;
   const issues=byMarker.get(label)||[];issues.push(issue);byMarker.set(label,issues);
  }
 }
 const creates=changes.filter(row=>row.action==='create');
 const assignments=[];
 for(const item of creates.filter(row=>row.kind==='Epic')){
  const id=item.path;
  if(!canRenumber(register,id))continue;
  const prefix=epics.filter(issue=>String(issue.fields.summary||'').match(/^\s*(BR-\d+)\b/i)?.[1]?.toUpperCase()===id);
  const sameMarker=byMarker.get(marker(id))||[];
  const collision=prefix.length||creates.some(row=>root(row.path)===id&&byMarker.has(marker(row.path)));
  // If a matching or possibly renamed Epic is present, the existing identity
  // checks must reconcile it. Only allocate a fresh ID for separate work.
  if(!collision||sameMarker.length>1||[...prefix,...sameMarker].some(issue=>similar(item.title,issue.fields.summary))||
    epics.some(issue=>epicName(item.title)===epicName(issue.fields.summary)))continue;
  if(!Number.isSafeInteger(next+1))throw Error('Jira Business Requirement identifier range is exhausted.');
  const replacement='BR-'+String(++next).padStart(3,'0');
  assignments.push({id,replacement});
 }
 return assignments;
}

module.exports={canRenumber,plan};
