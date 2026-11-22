'use strict';

// These are Jira description sections, not assumptions about site-specific
// custom field IDs. The approved BR remains the source of the base text.
const {extractGwt}=require('./jira-template-knowledge');
const MAX_DETAIL_LENGTH=5000;
const CHECK_FIELDS=['acceptanceCriteria','definitionOfDone'];
function normalizeDetails(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Jira issue details.');
 const result={};
 for(const field of CHECK_FIELDS){
  const text=value[field]??'';
  if(typeof text!=='string'||text.length>MAX_DETAIL_LENGTH)throw Error('Jira '+(field==='acceptanceCriteria'?'acceptance criteria':'definition of done')+' must be plain text up to '+MAX_DETAIL_LENGTH+' characters.');
  result[field]=text.trim();
 }
 if(value.summary!==undefined){
  if(typeof value.summary!=='string'||!value.summary.trim()||value.summary.trim().length>254||/[\r\n]/.test(value.summary))throw Error('Jira summary must be 1–254 characters on one line.');
  result.summary=value.summary.trim();
 }
 if(value.description!==undefined){
  if(typeof value.description!=='string'||value.description.length>32000)throw Error('Jira description must be text of at most 32,000 characters.');
  result.description=value.description.replace(/\r\n?/g,'\n').trim();
 }
 if(value.fieldValues!==undefined){
  if(!value.fieldValues||typeof value.fieldValues!=='object'||Array.isArray(value.fieldValues)||Object.keys(value.fieldValues).length>100)throw Error('Invalid Jira field changes.');
  const entries=Object.entries(value.fieldValues).map(([id,value])=>{
   if(!/^(?:customfield_\d+|environment|priority|duedate|components|versions|fixVersions)$/.test(id))throw Error('Invalid editable Jira field ID.');
   const values=Array.isArray(value)?value:[value];
   if(values.length>100||values.some(text=>typeof text!=='string'||text.length>32000))throw Error('Invalid Jira field value.');
   return [id,value];
  });
  if(entries.length)result.fieldValues=Object.fromEntries(entries);
 }
 return result;
}

function issueChecks(value={}){
 const result={};
 for(const id of CHECK_FIELDS){
  if(value[id]===undefined||value[id]==='')continue;
  if(typeof value[id]!=='string'||value[id].length>MAX_DETAIL_LENGTH)throw Error('Invalid issue-specific '+id+'.');
  if(value[id].trim())result[id]=value[id].trim();
 }
 return result;
}

function fieldSection(name){
 const key=String(name||'').toLowerCase().replace(/[^a-z]/g,' ');
 if(/^ac$/.test(key.trim())||/\b(acceptance\s+(criteria|criterion|conditions)|acceptance\s+tests)\b/.test(key))return 'acceptanceCriteria';
 if(/^dod$/.test(key.trim())||/\b(definition\s+of\s+(done|complete)|completion\s+criteria|done\s+criteria)\b/.test(key))return 'definitionOfDone';
 return '';
}

const labels={acceptanceCriteria:'Acceptance criteria',definitionOfDone:'Definition of done'};
function generalize(item,approvedBR={},template){
 const manual=item.jiraDetails||{}, proposed=item.issueChecks||{};
 const text=baseDescription(item).split(/\n+/)
  .map(line=>line.trim()).filter(line=>line&&!/^(Feature( identity)?|BR story|ATGV (SDLC role|story reference)|Approved Business Requirement|Source Story):/.test(line)).join('\n');
 const relevant=item.kind&&item.kind!=='Epic'?text:'';
 const statements=relevant.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
 const checks=statements.slice(0,6).map((statement,index)=>(index+1)+'. Verify '+statement.replace(/^[-•]\s*/,'')).join('\n');
 const acceptanceCriteria=manual.acceptanceCriteria||proposed.acceptanceCriteria||extractGwt(relevant)||checks||
  approvedBR.acceptanceCriteria||('Verify the expected outcome for '+(item.title||'this Jira item')+' against the approved requirement.');
 const approvedChecklist=template?.status==='approved'&&item.kind==='Story'?template.items.map(text=>'[ ] '+text).join('\n'):'';
 const completion=['Verify the issue-specific acceptance criteria and attach the results.'];
 if(['Epic','Feature'].includes(item.kind))completion.push('Confirm the linked work satisfies the approved scope and record any open exceptions.');
 else completion.push('Review the delivered change and record applicable positive and negative checks.');
 const definitionOfDone=manual.definitionOfDone||approvedChecklist||proposed.definitionOfDone||completion.map(text=>'[ ] '+text).join('\n');
 return {acceptanceCriteria,definitionOfDone};
}

function sectionsFor(details,excluded=new Set()){
 return CHECK_FIELDS.filter(id=>!excluded.has(id)&&details[id]).map(id=>labels[id]+':\n'+details[id]);
}

function baseDescription(item){
 const description=String(item.description??'');
 if(item.jiraDetails?.description!==undefined)return item.jiraDetails.description;
 const suffix=sectionsFor(item.jiraDetails||{}).join('\n\n');
 if(!suffix)return description;
 if(description===suffix)return '';
 return description.endsWith('\n\n'+suffix)?description.slice(0,-suffix.length-2):description;
}

function publishDescription(item,details,mapped){
 return [baseDescription(item),...sectionsFor(details,mapped)].filter(Boolean).join('\n\n');
}

function applyDetails(item,details){
 const clean=normalizeDetails(details);
 const sections=sectionsFor(clean);
 if(!sections.length&&clean.summary===undefined&&clean.description===undefined&&!clean.fieldValues)return item;
 const description=clean.description??String(item.description||'');
 return {...item,title:clean.summary??item.title,description:[description,...sections].filter(Boolean).join('\n\n'),jiraDetails:clean};
}
function issueType(item,types=[],previous={}){
 if(item.action!=='create')return previous.issueType||'';
 const standard=name=>types.find(t=>!t.subtask&&String(t.name||'').toLowerCase()===name.toLowerCase());
 const subtask=types.find(t=>t.subtask&&/^(sub-task|subtask)$/i.test(String(t.name||'')));
 if(item.kind==='Epic')return standard('Epic')?.name||'';
 if(item.kind==='Story'&&item.issueLevel==='standard')return standard('Story')?.name||'';
 if(['Story','Task','Role'].includes(item.kind))return subtask?.name||'';
 if(item.kind==='Feature')return (standard('Feature')||standard('Story'))?.name||'';
 return '';
}
module.exports={MAX_DETAIL_LENGTH,normalizeDetails,applyDetails,issueType,issueChecks,fieldSection,generalize,baseDescription,publishDescription};
