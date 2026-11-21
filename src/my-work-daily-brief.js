'use strict';
// Read-only, deterministic My Work morning/daily brief.
// Jira/Confluence data are evidence, not instructions or live presence signals.
const clean=(value,max=160)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const finished=status=>/^(?:done|closed|resolved|complete|completed|approved|published)$/i.test(clean(status,60));
function guessedName(email,preferred=''){
 const local=clean(email,250).split('@')[0]||'';
 const parts=local.split('+')[0].replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[._-]+/g,' ')
  .replace(/\d{3,}$/,'').split(/\s+/).filter(Boolean).slice(0,4);
 const looksHuman=parts.some(p=>/^[A-Za-zÀ-ÿ]{2,}$/.test(p))&&!/^(?:noreply|no-reply|admin|support|info|service|user|test|system|team)$/i.test(local);
 const suggested=parts.map(p=>p.charAt(0).toLocaleUpperCase('en')+p.slice(1)).join(' ');
 return clean(looksHuman?suggested:preferred,80)||'there';
}
function dayLocal(date=new Date()){
 if(!(date instanceof Date)||Number.isNaN(date.getTime()))throw Error('Invalid local date.');
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function calendarDays(deadline,today){
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(String(deadline||''))&&
  !Number.isNaN(Date.parse(deadline+'T00:00:00Z'));
 if(!valid)return null;
 const a=Date.parse(deadline+'T00:00:00Z'),b=Date.parse(today+'T00:00:00Z');
 return Math.round((a-b)/86400000);
}
function health({deadline='',today=dayLocal(),outstanding=0,openJira=0,knownWork=false,risk=null}={}){
 const days=calendarDays(deadline,today);
 const count=key=>Array.isArray(risk?.[key])?risk[key].length:0;
 const signals={blocked:count('blockers'),overdue:count('overdue'),unassigned:count('unassigned'),
  sampledJira:risk?.scanned||0,possiblyTruncated:!!risk?.possiblyTruncated};
 const riskText=risk&&(signals.blocked||signals.overdue||signals.unassigned)?
  ' Visible Jira signals: '+signals.blocked+' blocked, '+signals.overdue+' overdue, '+signals.unassigned+' unassigned (sampled, not exhaustive).':'';
 const scope=' Based on '+(knownWork?'visible role tasks and shared open Jira items':'limited available activity evidence')+
  '; this is not a complete project forecast. Team capacity, estimates and critical path require verification.';
 const result=(code,label,detail)=>({code,label,detail:detail+riskText+scope,
  daysRemaining:days,signals});
 if(!deadline)return result('unverified','Schedule not yet verified',
  'No project deadline is configured. Set one in Project Settings before judging schedule health.');
 if(days===null)return result('needs-setting','Deadline needs correction',
  'The saved deadline is not a valid calendar date. Review Project Settings.');
 if(days<0)return result('at-risk','Deadline passed',
  'The deadline passed '+Math.abs(days)+' day(s) ago'+(outstanding||openJira?
   '; '+(outstanding+openJira)+' visible unfinished/open items require a recovery plan.':
   '; verify delivery sign-off and any remaining work.'));
 if(days===0)return result('at-risk','Deadline is today',
  'The project deadline is today. Reconcile blockers, incomplete work and release criteria before sign-off.');
 if(signals.blocked||signals.overdue)return result(days<=14?'at-risk':'watch',
  days<=14?'Delivery risk identified':'Blocked or overdue work needs attention',
  days+' day(s) until deadline with visible Jira blockers or overdue work. Escalate owners and verify a recovery plan.');
 if(days<=14&&(outstanding||openJira))return result('watch','Schedule needs attention',
  days+' day(s) until the deadline with '+(outstanding+openJira)+' visible incomplete/open items. Prioritize dependencies and confirm achievable capacity.');
 return result('unverified','Schedule requires verification',
  days+' day(s) until deadline. Compare verified Jira progress against approved effort estimates before treating the project as on track.');
}
function summarizeOtherUsers(rows,accountId,email){
 const id=clean(accountId,200),mail=clean(email,250).toLowerCase(),seen=new Set(),out=[];
 for(const row of Array.isArray(rows)?rows:[]){
  const memberId=clean(row?.id,200),memberMail=clean(row?.email,250).toLowerCase();
  if(!memberId&&!memberMail)continue;
  if((id&&memberId===id)||(mail&&memberMail===mail))continue;
  const fingerprint=memberId||memberMail;if(seen.has(fingerprint))continue;
  seen.add(fingerprint);
  const parts=String(row?.tasks||'').split(';').filter(x=>/\b[A-Z][A-Z0-9_]+-\d+\b/.test(x));
  const roles=(Array.isArray(row?.roles)?row.roles:[]).map(x=>clean(x,70)).filter(Boolean).slice(0,3);
  const name=clean(row?.name,90)||guessedName(memberMail);
  out.push({name,roles,assignedJira:parts.length});
  if(out.length>=6)break;
 }
 return out;
}
function build({
 identity={},roleId='',roleName='',projectName='',deadline='',tasks=[],assigned=[],
 requirements=[],activity=null,roster=null,config={},now=new Date()
}={}){
 const today=dayLocal(now),name=guessedName(identity.email,identity.displayName);
 const greeting='Hello, '+name+'. Here is your '+clean(roleName||'project',80)+' briefing for '+now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'.';
 const pendingTasks=(Array.isArray(tasks)?tasks:[]).filter(t=>t&&!t.completed).map(t=>clean(t.activity||t.title,130)).filter(Boolean);
 const pendingIssues=(Array.isArray(assigned)?assigned:[]).filter(x=>x?.jiraKey&&!finished(x.status)).slice(0,10);
 const pendingRequirements=(Array.isArray(requirements)?requirements:[]).filter(x=>x?.id&&!finished(x.status)).slice(0,10);
 const sharedIssues=Array.isArray(activity?.inProgress)?activity.inProgress:[],sharedBRs=Array.isArray(activity?.incompleteBRs)?activity.incompleteBRs:[];
 const h=health({deadline,today,outstanding:pendingTasks.length+pendingRequirements.length,
  openJira:sharedIssues.length,knownWork:tasks.length>0||!!activity?.jiraAvailable,
  risk:activity?.jiraAvailable?activity.risk:null});
 const team=summarizeOtherUsers(roster?.rows||[],identity.accountId,identity.email);
 const todayActions=[];
 const add=(label,reason,target='role-workspace')=>{if(todayActions.length<4&&!todayActions.some(x=>x.label===label))todayActions.push({label,reason,target});};
 if(!config.jiraConfigured)add('Verify Jira connection','Project Jira settings are missing or incomplete','project-settings');
 if(!config.confluenceConfigured)add('Verify Confluence synchronization','Project Confluence space is not configured','project-settings');
 if(!deadline||h.code==='needs-setting')add('Set or correct the project deadline','Schedule health needs a valid target date','project-settings');
 if(h.daysRemaining!==null&&h.daysRemaining<=0)add('Review delivery recovery or sign-off','The configured project deadline has arrived or passed');
 if(activity?.jiraAvailable&&Array.isArray(activity.risk?.blockers)&&activity.risk.blockers.length)
  add('Review blocker '+clean(activity.risk.blockers[0].key,35),'Verified Jira blocker; coordinate with its owner');
 if(activity?.jiraAvailable&&Array.isArray(activity.risk?.overdue)&&activity.risk.overdue.length)
  add('Review overdue '+clean(activity.risk.overdue[0].key,35),'Verified Jira due date has passed');
 if(roleId==='business-analyst'&&pendingRequirements.length)add('Continue '+pendingRequirements[0].id,'Unfinished Business Requirement','discovery');
 if(pendingIssues.length)add('Review '+pendingIssues[0].jiraKey,'Assigned Jira issue '+clean(pendingIssues[0].status,35));
 if(pendingTasks.length)add('Complete '+pendingTasks[0],'Unfinished '+clean(roleName||roleId,50)+' workflow');
 if(roleId==='project-manager'&&sharedIssues.length)add('Review '+clean(sharedIssues[0].key,35)+' with its owner','Project-wide Jira work in progress');
 if(todayActions.length===0)add('Review your role workspace and confirm priorities','No urgent verified task was identified; check the current workflow');
 return {
  projectName:clean(projectName,120),today,name,greeting,health:h,team,
  teamAvailable:!!roster,teamSummary:roster?(team.length?team.length+' other recorded project member(s)':'No other distinct verified members listed'):'Shared My Work Users roster unavailable',
  todayActions,roleName:clean(roleName,80),
  evidence:{jiraAvailable:!!activity?.jiraAvailable,confluenceAvailable:!!activity?.confluenceAvailable,
   rosterAvailable:!!roster,deadlineConfigured:!!deadline}
 };
}
module.exports={clean,finished,guessedName,dayLocal,calendarDays,health,summarizeOtherUsers,build};
