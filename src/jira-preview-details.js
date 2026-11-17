'use strict';

// These are Jira description sections, not assumptions about site-specific
// custom field IDs. The approved BR remains the source of the base text.
const MAX_DETAIL_LENGTH=5000;
function normalizeDetails(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Jira issue details.');
 const result={};
 for(const field of ['acceptanceCriteria','definitionOfDone']){
  const text=value[field]??'';
  if(typeof text!=='string'||text.length>MAX_DETAIL_LENGTH)throw Error('Jira '+(field==='acceptanceCriteria'?'acceptance criteria':'definition of done')+' must be plain text up to '+MAX_DETAIL_LENGTH+' characters.');
  result[field]=text.trim();
 }
 return result;
}
function applyDetails(item,details){
 const clean=normalizeDetails(details);
 const sections=[];
 if(clean.acceptanceCriteria)sections.push('Acceptance criteria:\n'+clean.acceptanceCriteria);
 if(clean.definitionOfDone)sections.push('Definition of done:\n'+clean.definitionOfDone);
 if(!sections.length)return item;
 return {...item,description:[String(item.description||''),...sections].filter(Boolean).join('\n\n'),jiraDetails:clean};
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
module.exports={MAX_DETAIL_LENGTH,normalizeDetails,applyDetails,issueType};
