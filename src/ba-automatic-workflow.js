'use strict';

const {QUESTIONS,noOpenDecisions}=require('./ba-discovery');

const stages=Object.freeze(['source','requirements','jira']);
const missing='Unspecified in the source document.';

function titleFromSource(sourceName='',requirements=[]){
 const title=requirements.find(br=>!br.archivedFromRestart&&br.status!=='retired')?.title;
 const name=String(sourceName).replace(/\.[a-z0-9]{2,5}$/i,'').replace(/[_-]+/g,' ')
  .replace(/\b(?:requirements? document|BRD|draft|revised|version \d+(?:\.\d+)*|v\d+(?:\.\d+)*)\b/gi,'')
  .replace(/\s+/g,' ').trim();
 const label=requirements.length===1&&title?title:name||title||'';
 return label.length>64?label.slice(0,61).replace(/\s+\S*$/,'').trim()+'…':label;
}

function mappedAnswers(mapped,manual={}){
 return Object.fromEntries(QUESTIONS.map(([key])=>{
  const value=String(manual[key]??mapped[key]??'').trim();
  if(key==='questions'&&(!value||/^(?:no (?:open|outstanding|unresolved) (?:decisions|questions|issues)(?: (?:recorded|identified|in the source|from this source))?|(?:not|none) (?:specified|provided|stated))\.?$/i.test(value)))return [key,'No open decisions'];
  return [key,value||missing];
 }));
}

// A review may improve wording or surface a missing decision. It cannot
// turn new business assumptions into source facts.
function applyGroundedReview(answers,review,manual={}){
 const updated={...answers};
 const tokens=text=>new Set(String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]);
 for(const {key,suggestedAnswer} of review.suggestions||[]){
  if(key==='questions'||Object.hasOwn(manual,key)||!Object.hasOwn(answers,key)||!suggestedAnswer)continue;
  const known=tokens(answers[key]);
  // This also preserves every threshold, qualifier and source term.
  const candidate=tokens(suggestedAnswer);
  if(known.size&&known.size===candidate.size&&[...known].every(token=>candidate.has(token))
   &&JSON.stringify(answers[key].match(/\d+(?:\.\d+)?/g))===JSON.stringify(suggestedAnswer.match(/\d+(?:\.\d+)?/g))
   &&answers[key].replace(/[\s\p{P}]+/gu,' ').toLowerCase().trim()===suggestedAnswer.replace(/[\s\p{P}]+/gu,' ').toLowerCase().trim())updated[key]=suggestedAnswer;
 }
 return updated;
}

function isoDocument(sourceName,register,corrected){
 const answers=register.discoveryAnswers||{};
 const requirements=register.brs.filter(br=>!br.archivedFromRestart&&br.status!=='retired');
 const show=key=>answers[key]||missing;
 return [
  '# '+(titleFromSource(sourceName,requirements)||'Business Requirements Specification'),
  'Business Requirements Specification · ISO/IEC/IEEE 29148:2018 outline',
  'Source document · '+sourceName,
  '## Business purpose and scope',show('problem'),show('scope'),
  '## Business overview and stakeholders',show('stakeholders'),
  '## Business operational requirements',show('currentProcess'),show('targetProcess'),show('businessRules'),
  '## Constraints and dependencies',show('constraints'),show('dependencies'),show('data'),
  '## Business requirements and acceptance criteria',
  ...requirements.flatMap(br=>['### '+br.id+' · '+br.title,br.objective,br.scope,br.acceptanceCriteria,
   ...(br.jiraPlacement?['Suggested Jira placement · '+br.jiraPlacement]:[])]),
  '## Measures and open decisions',show('measures'),show('questions'),
  '## Source and AI preflight evidence',corrected||'Source checks are pending.'
 ].join('\n\n');
}

function publicationIssues(register){
 const blockers=[];
 const answers=register.discoveryAnswers||{};
 if(!QUESTIONS.every(([key])=>String(answers[key]||'').trim()))blockers.push('Complete the 12 Discovery answers.');
 const material=['problem','scope','targetProcess','acceptance'];
 for(const key of material)if(String(answers[key]||'').trim()===missing)blockers.push('Provide '+QUESTIONS.find(([id])=>id===key)[1].toLowerCase()+' in Discovery.');
 if(answers.questions&&!noOpenDecisions(answers.questions))blockers.push('Resolve open decisions in Discovery question 12.');
 if(!register.reviewRevision||register.reviewRevision!==register.discoveryRevision)blockers.push('Refresh the AI review of the current Discovery answers.');
 for(const report of register.mappingCompleted?.preflights||[]){
  for(const issue of report.issues||[]){
   if(issue.severity==='blocker'&&issue.category==='contradiction')blockers.push(issue.detail||'Resolve contradictory source statements.');
  }
 }
 return [...new Set(blockers)];
}

async function run(from,{prepareSource,developRequirements,prepareJira,progress,signal}){
 const start=stages.indexOf(from);
 if(start<0)throw Error('Invalid Business Requirements stage.');
 const actions={source:prepareSource,requirements:developRequirements,jira:prepareJira};
 for(const stage of stages.slice(start)){
  signal?.throwIfAborted();
  await progress(stage);
  await actions[stage]();
 }
}

module.exports={stages,missing,titleFromSource,mappedAnswers,applyGroundedReview,isoDocument,publicationIssues,run};
