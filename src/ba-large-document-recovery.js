'use strict';
// Conservative, source-only recovery for oversized BA documents when an AI
// provider times out. No invented requirements, assumed approvals or "pass"
// claims. The original source and complete working BR remain authoritative.
const LARGE_CHARS=60000;
const SENTINEL='atgv-source-only-recovery-v1';
const STAGES=Object.freeze({
 preflight:{largeTimeoutMs:45000,normalTimeoutMs:120000},
 mapping:{largeTimeoutMs:75000,normalTimeoutMs:180000},
 cross:{largeTimeoutMs:60000,normalTimeoutMs:180000}
});
const isLargeDocument=textLength=>Number(textLength)>=LARGE_CHARS;
function timeout(stage,isLarge){const item=STAGES[stage];if(!item)throw Error('Invalid BA AI stage.');return isLarge?item.largeTimeoutMs:item.normalTimeoutMs;}
function attempts(stage,isLarge,hasSecondaryProvider){if(!STAGES[stage])throw Error('Invalid BA AI stage.');return isLarge?(hasSecondaryProvider?2:1):3;}
function checkpointRecord(stage){
 if(!['preflight','mapping'].includes(stage))throw Error('Invalid recovery checkpoint stage.');
 return JSON.stringify({atgvFallback:SENTINEL,stage,sourceOnly:true,reviewRequired:true});
}
function isCheckpointRecord(text,stage){
 if(typeof text!=='string'||text.length>512)return false;
 try{const data=JSON.parse(text);return data?.atgvFallback===SENTINEL&&data.stage===stage&&data.sourceOnly===true&&data.reviewRequired===true;}
 catch{return false;}
}
function preflight(text){
 if(typeof text!=='string'||!text.trim())throw Error('Source-only preflight requires readable source text.');
 const reason='AI preflight was unavailable or timed out. Source-only recovery contains NO AI quality validation. All business-policy conflicts and unanswered decisions require Business Analyst review.';
 return {
  ready:true,status:'needs-review',degraded:true,summary:reason,
  effectiveText:text,applied:[],skipped:[],blockers:[],resolutions:[],
  issues:[{severity:'warning',category:'ai-verification',detail:reason,sourceExcerpt:'',suggestion:'Review the original requirements, source-only mapping and unresolved decision register before approving a BR.'}]
 };
}
// These patterns only select LITERAL lines; no inferences or generated policy.
const PATTERNS=Object.freeze({
 problem:/\b(?:business problem|purpose|objectives?|expected outcome|project overview|project initiation)\b/i,
 stakeholders:/\b(?:stakeholder|initiator|sponsor|approver|portfolio lead|product manager|workstream lead|finance|pmo|architecture)\b/i,
 currentProcess:/\b(?:current process|existing process|as.is|manual process|current state)\b/i,
 targetProcess:/\b(?:target process|lifecycle|workflow|submission|handoff|stage|approval route|transition)\b/i,
 scope:/\b(?:scope|in.scope|out.of.scope|mvp|exclusion|implementation cost below)\b/i,
 businessRules:/\b(?:shall|must|prohibit|require|restrict|segregat|only if|shall not|cannot|validation)\b/i,
 acceptance:/\b(?:acceptance|given|when|then|verification|test scenario)\b/i,
 data:/\b(?:data|record|cost centre|cost center|audit|retention|classification|master.data)\b/i,
 dependencies:/\b(?:dependenc|integration|jira|sap|ariba|falco|trm|external system|architecture)\b/i,
 constraints:/\b(?:constraint|non.functional|performance|accessibility|security|privacy|recovery|compatibility)\b/i,
 measures:/\b(?:measur|metric|kpi|success criter|acceptance threshold|target|percentile)\b/i,
 questions:/\b(?:open decision|unresolved|conflict|pending sign.off|confirmation required|^D-\d\d\b)\b/i
});
function mapping(text,{section=1,totalSections=1}={}){
 if(typeof text!=='string'||!text.trim())throw Error('Source-only mapping requires readable source text.');
 const sectionId=Number.isInteger(section)&&section>0?section:1;
 const total=Number.isInteger(totalSections)&&totalSections>0?totalSections:1;
 const rows=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const answer={};
 const provenance='[SOURCE-ONLY EXTRACTION; AI NOT VERIFIED; BA REVIEW REQUIRED; SECTION '+sectionId+'/'+total+']';
 for(const [key,rx] of Object.entries(PATTERNS)){
  const limit=key==='businessRules'?4300:key==='questions'?3200:2200;
  const seen=new Set(),chosen=[];let used=provenance.length+2;
  for(const line of rows){
   if(!rx.test(line))continue;
   const snippet=line.slice(0,420),norm=snippet.toLowerCase().replace(/\s+/g,' ');
   if(seen.has(norm))continue;
   if(used+snippet.length+1>limit)continue;
   seen.add(norm);chosen.push(snippet);used+=snippet.length+1;
  }
  answer[key]=chosen.length?provenance+'\n'+chosen.join('\n'):'';
 }
 if(Object.values(answer).every(x=>!x)){
  answer.businessRules=provenance+'\n'+rows.slice(0,10).join('\n').slice(0,3000);
 }
 return answer;
}
module.exports={LARGE_CHARS,isLargeDocument,timeout,attempts,checkpointRecord,isCheckpointRecord,preflight,mapping};
