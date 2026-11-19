'use strict';
// Explicit opt-in after three actual AI request timeouts.
// This NEVER waives BA approval, Jira preflight, permission checks, or tests.
const MARKER='User selected simplified Jira draft mode after three AI timeouts';
function timedOut(error){
 if(error?.code==='ATGV_SOURCE_AI_TIMEOUT'||error?.name==='TimeoutError')return true;
 return /\b(?:timed?\s*out|timeout|etimedout)\b/i.test(String(error?.message||''));
}
async function registerTimeout(run,error,confirm){
 if(!timedOut(error)||run?.controller?.signal?.aborted)return false;
 run.aiTimeoutFailures=(run.aiTimeoutFailures||0)+1;
 if(run.skipAiChecks)return true;
 if(run.aiTimeoutFailures!==3||run.skipOfferShown)return false;
 run.skipOfferShown=true;
 const response=await confirm({
  failures:run.aiTimeoutFailures,
  message:'AI document processing has timed out three times. Would you like to skip further AI quality checks and continue with a simplified, source-backed draft for Jira? This is NOT verified or published. The original BR remains intact, and BA approval and Jira safeguards are still required.',
  button:'Skip AI Checks — Simple Jira Draft'
 });
 if(response===true)run.skipAiChecks=true;
 return run.skipAiChecks===true;
}
function isSimplifiedEvidence(register){
 return (register?.mappingCompleted?.preflights||[]).some(row=>String(row.summary||'').includes(MARKER));
}
// Create a bounded, traceable REVIEW-ONLY requirements draft. No fabricated
// business rules, approvals, thresholds, or claims of completed testing.
function simpleProposal({name,text,answers}={}){
 const source=String(text||'');
 if(!source.trim())throw Error('The original readable source document is required to create a simplified Jira draft.');
 const lines=source.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const pattern=/^(?:[-*]\s*)?(?:REQ|BR|FR|NFR|GATE|AC|UC|US)[-_. ]?[A-Z0-9]+(?:[-_.][A-Z0-9]+)*\s*[:.\-–]?\s+.{12,}/i;
 const selected=[],seen=new Set();
 for(const line of lines){
  if(!pattern.test(line))continue;
  const short=line.slice(0,1100),fingerprint=short.toLowerCase();
  if(seen.has(fingerprint))continue;
  seen.add(fingerprint);selected.push(short);
  if(selected.length>=256)break;
 }
 // If source is not numbered, preserve literal normative statements instead.
 if(!selected.length)for(const line of lines){
  if(!/\b(?:shall|must|required to|is required|should)\b/i.test(line)||line.length<28)continue;
  selected.push(line.slice(0,1100));if(selected.length>=128)break;
 }
 if(!selected.length)throw Error('No identifiable source requirements were found. The BA must identify at least one testable statement before drafting Jira tasks.');
 const batches=[];for(let i=0;i<selected.length;i+=16)batches.push(selected.slice(i,i+16));
 const features=batches.slice(0,16).map((batch,index)=>({
  title:'Source requirement group '+(index+1)+' — review required',
  description:'Literal source statements. AI analysis, acceptance criteria and business decisions NOT VERIFIED.',
  stories:batch.map(line=>({
   title:line.slice(0,170),
   description:'Source evidence (unverified): '+line+'\nBA must confirm role, expected outcome and testable acceptance criteria.',
   tasks:[{title:'Review and implement source statement',description:'Verify source evidence, obtain BA-approved acceptance criteria, then implement and test: '+line.slice(0,900)}]
  }))
 }));
 const total=selected.length,documentTitle=String(name||'Business Requirements').replace(/\.(docx|pdf)$/i,'').slice(0,155);
 return [{
  title:documentTitle+' — simplified review draft',
  objective:'Review and validate requirements literally extracted from the uploaded source. No AI requirements verification was performed.',
  scope:'Source document: '+String(name||'uploaded document').slice(0,220)+'. '+total+' source requirement statement(s) copied into provisional Jira story drafts. Other statements and open decisions require BA review.',
  acceptanceCriteria:'NOT VERIFIED. Business Analyst must define and approve testable acceptance criteria from the full original source before Jira publication. No project or integration tests have been run.',
  features
 }];
}
module.exports={MARKER,timedOut,registerTimeout,isSimplifiedEvidence,simpleProposal};
