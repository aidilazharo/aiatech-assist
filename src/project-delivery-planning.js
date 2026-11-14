'use strict';
// Deterministic, read-only planning engine. Jira and the manually supplied
// project deadline are inputs; this module NEVER changes either of them.
const DAY=86400000;
const asDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s?s:'';
const toDay=s=>Math.floor(Date.parse(s+'T00:00:00Z')/DAY);
const fromDay=n=>new Date(n*DAY).toISOString().slice(0,10);
const working=n=>{const d=new Date(n*DAY).getUTCDay();return d!==0&&d!==6;};
const nextWork=n=>{while(!working(n))n++;return n;};
const addWork=(start,count)=>{let n=nextWork(start);for(let i=1;i<count;i++)n=nextWork(n+1);return n;};
const noWorkAfter=n=>nextWork(n+1);
const done=x=>x?.statusCategory==='done'||/^(done|closed|resolved|complete|completed)$/i.test(String(x?.status||''));
const cancelled=x=>/^(cancelled|canceled|won't do|duplicate)$/i.test(String(x?.status||x?.resolution||''));
const HOURS_PER_MD=8;
function estimate(item){
 const seconds=Number(item?.originalEstimateSeconds);
 if(Number.isFinite(seconds)&&seconds>0)return {md:Math.max(.125,Math.round(seconds/3600/HOURS_PER_MD*8)/8),source:'jira'};
 const title=String(item?.summary||''),description=String(item?.description||'');
 const text=(title+' '+description).toLowerCase();
 const type=String(item?.type||'').toLowerCase();
 let md=/qa|test|verification|uat/.test(text)?2:/ux|wireframe|mockup|design/.test(text)?3:/architecture|solution design/.test(text)?3:/deploy|release/.test(text)?1.5:/sub.?task/.test(type)?4:6;
 if(/migration|authentication|complex|integration|payment|security/.test(text))md+=3;
 if(/simple|minor|typo|copy change/.test(text))md=Math.max(.5,md-2);
 return {md,low:Math.max(.5,Math.round(md*.65*2)/2),high:Math.round(md*1.6*2)/2,source:'heuristic-unapproved'};
}
function role(item){const labels=Array.isArray(item?.labels)?item.labels:[];
 const label=labels.find(x=>/^atgv-role-/.test(x));if(label)return label;
 const title=String(item?.summary||'').toLowerCase();
 return /ui\/ux|design/.test(title)?'ux-designer':/qa|test/.test(title)?'qa-engineer':/uat|acceptance/.test(title)?'uat-tester':/release|deploy/.test(title)?'release-manager':/architecture/.test(title)?'solution-architect':'software-developer';
}
function leafTasks(items){const rows=(Array.isArray(items)?items:[]).filter(x=>x?.key&&!cancelled(x));
 const hasChild=new Set([...rows.map(x=>String(x.parentKey||'')),...rows.filter(x=>(x.labels||[]).some(label=>String(label).startsWith('atgv-role-'))).map(x=>String(x.sourceStoryKey||''))].filter(Boolean));
 return rows.filter(x=>!hasChild.has(x.key)&&!/^epic$/i.test(String(x.type||'')));
}
function plan(items,{today='',startDate='',deadline='',overrides={},capacity={},holidays=[]}={}){
 const all=leafTasks(items);if(all.length>20000)throw Error('Too many Jira tasks for one delivery forecast.');
 const baseDate=asDate(today)||new Date().toISOString().slice(0,10);
 const begin=nextWork(Math.max(toDay(baseDate),toDay(asDate(startDate)||baseDate)));
 const nonworking=new Set(holidays.filter(asDate));
 const nextDay=n=>{let day=n;while(!working(day)||nonworking.has(fromDay(day)))day++;return day;};
 const advance=(start,count)=>{let n=nextDay(start);for(let i=1;i<count;i++)n=nextDay(n+1);return n;};
 const slots=new Map(),byKey=new Map(),rows=[];
 for(const item of all){
  const estimateValue=estimate(item),key=item.key,approved=Number(overrides[key]);
  const md=Number.isFinite(approved)&&approved>0&&approved<=1000?approved:estimateValue.md;
  const progress=done(item)?1:Math.max(0,Math.min(1,Number(item.verifiedProgress)||0));
  const assignee=String(item.assigneeId||'').trim();const kind=role(item);
  const lane=assignee?'user:'+assignee:'role:'+kind;
  const depends=[...new Set((Array.isArray(item.dependsOn)?item.dependsOn:[]).filter(v=>v&&v!==key))];
  const row={key,summary:item.summary||key,type:item.type||'',role:kind,parentKey:item.parentKey||'',assignee:item.assignee||'',lane,dependencies:depends,
   md,range:[estimateValue.low??md,estimateValue.high??md],estimateSource:Object.hasOwn(overrides,key)?'approved':estimateValue.source,
   progress:Math.round(progress*100),completed:done(item),remainingMd:Math.max(0,Math.round(md*(1-progress)*100)/100)};
  rows.push(row);byKey.set(key,row);
 }
 const pending=new Set(rows.map(x=>x.key));let passes=0;const scheduled=new Set();
 // Stable topological scheduling with capacity, without silently ignoring cycles.
 while(pending.size){
  let advanced=false;
  for(const row of rows){if(!pending.has(row.key))continue;
   const internal=row.dependencies.filter(key=>byKey.has(key));
   if(internal.some(key=>!scheduled.has(key)))continue;
   if(row.completed){row.start=fromDay(begin);row.end=fromDay(begin);row.durationDays=0;pending.delete(row.key);scheduled.add(row.key);advanced=true;continue;}
   let start=begin;
   for(const key of internal)if(!byKey.get(key).completed)start=Math.max(start,noWorkAfter(toDay(byKey.get(key).end)));
   if(slots.has(row.lane))start=Math.max(start,noWorkAfter(slots.get(row.lane)));
   start=nextDay(start);
   const n=Number(capacity[row.lane]);const available=Number.isFinite(n)&&n>0&&n<=20?n:1;
   // Parallelism is capped by available capacity. MD remains effort, not duration.
   const duration=Math.max(1,Math.ceil(row.remainingMd/available));
   const end=advance(start,duration);
   row.start=fromDay(start);row.end=fromDay(end);row.durationDays=duration;
   slots.set(row.lane,end);pending.delete(row.key);scheduled.add(row.key);advanced=true;
  }
  if(!advanced)throw Error('Cyclic Jira task dependencies: '+[...pending].slice(0,8).join(', '));
  if(++passes>20001)throw Error('Dependency planning exceeded safe iteration count.');
 }
 const totalMd=rows.reduce((n,x)=>n+x.md,0),earnedMd=rows.reduce((n,x)=>n+x.md*x.progress/100,0);
 const completionPercent=totalMd?Math.round(100*earnedMd/totalMd*10)/10:null;
 const finish=rows.filter(x=>x.remainingMd>0).map(x=>x.end).sort().at(-1)||'';
 const target=asDate(deadline),variance=target&&finish?toDay(finish)-toDay(target):null;
 const incomplete=rows.filter(x=>x.remainingMd>0);
 const critical=finish?incomplete.filter(x=>x.end===finish).map(x=>x.key):[];
 return {asOf:baseDate,deadline:target,forecastFinish:finish,varianceCalendarDays:variance,onTime:variance===null?null:variance<=0,
  totalMd:Math.round(totalMd*100)/100,remainingMd:Math.round(rows.reduce((n,x)=>n+x.remainingMd,0)*100)/100,
  earnedMd:Math.round(earnedMd*100)/100,completionPercent,unapprovedEstimates:rows.filter(x=>x.estimateSource==='heuristic-unapproved').length,
  critical,taskCount:rows.length,tasks:rows};
}
module.exports={asDate,done,cancelled,estimate,role,leafTasks,plan};
