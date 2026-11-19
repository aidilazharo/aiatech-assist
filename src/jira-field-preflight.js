'use strict';
const MISSING='Information not available in the approved Business Requirements document.';
const core=new Set(['project','issuetype','summary','description','parent','labels','status','resolution','created','updated','reporter','assignee','attachment','comment','worklog','issuelinks','subtasks','progress','aggregateprogress','votes','watches','creator','lastViewed','timetracking','aggregatetimeestimate','aggregatetimeoriginalestimate','aggregatetimespent','timeestimate','timeoriginalestimate','timespent','security','fixVersions','versions','components','priority','duedate']);
const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const present=value=>value!==null&&value!==undefined&&value!==''&&!(Array.isArray(value)&&!value.length);
function availableText(field,item,{approvedBR={},discoveryAnswers={}}={}){
 const name=norm(field.name), details=item.jiraDetails||{};
 const mapping=[
  [/^epic name$|^issue name$|^requirement title$/,item.title,'Approved BR title'],
  [/^business requirement id$|^br id$|^br reference$/,String(item.path||'').split('/')[0],'ATGV Business Requirement identity'],
  [/^detailed description$|^business description$|^requirement description$/,item.description,'Approved BR description'],
  [/acceptance criteria|acceptance criterion|acceptance conditions/,details.acceptanceCriteria||approvedBR.acceptanceCriteria,'Approved BR acceptance criteria'],
  [/definition of done|completion criteria|done criteria|definition of complete/,details.definitionOfDone,'Approved Jira preview Definition of Done'],
  [/business rule|policy/,discoveryAnswers.businessRules,'Saved business rules'],
  [/business objective|business outcome|business value/,approvedBR.objective||discoveryAnswers.problem,'Approved BR objective'],
  [/scope|in scope/,approvedBR.scope||discoveryAnswers.scope,'Approved BR scope'],
  [/stakeholder/,discoveryAnswers.stakeholders,'Saved stakeholders'],
  [/success criteria|success measure/,discoveryAnswers.measures,'Saved measurable outcomes'],
  [/dependency|dependencies/,discoveryAnswers.dependencies,'Saved dependencies'],
  [/constraint|non functional/,discoveryAnswers.constraints,'Saved constraints']
 ];
 for(const [pattern,value,source] of mapping)if(pattern.test(name)&&typeof value==='string'&&value.trim())return {text:value.trim(),source};
 return null;
}
function toRichText(text){
 // Split oversized inline nodes but never omit evidence from the source.
 return {type:'doc',version:1,content:String(text).split('\n').map(line=>({type:'paragraph',content:line?(line.match(/[\s\S]{1,10000}/g)||[]).map(part=>({type:'text',text:part})):[]}))};
}
function existingValueText(value){
 if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')return String(value).slice(0,350);
 if(value&&typeof value==='object')return 'Existing Jira value preserved';
 return '';
}
/** Every Jira metadata field receives a source-backed value or visible
 * missing-evidence placeholder. Only writable text fields accept placeholder
 * writes; typed values cannot accept fabricated strings and are preview-only.
 * Required typed fields without a valid default block publication. */
function planFields(item, metadata, context={}){
 if(!Array.isArray(metadata))throw Error('Jira did not return valid issue field metadata.');
 const fields=[],extraFields={},blocking=[],seen=new Set();
 const existing=context.existing?.fields||{};
 for(const raw of metadata){
  const id=String(raw?.id||''),name=String(raw?.name||id).slice(0,160);
  if(!id||seen.has(id))continue;
  seen.add(id);
  const type=String(raw?.schema?.type||'unknown'),custom=String(raw?.schema?.custom||'');
  const required=raw.required===true,hasDefault=raw.hasDefaultValue===true;
  const old=existing[id],hasOld=present(old);
  let display='',source='',status='not-available',value;
  if(core.has(id)){
   if(id==='summary'){display=item.title||'';source='Approved BR';status='planned';}
   else if(id==='description'){display=String(item.description||'').slice(0,350)||MISSING;source=item.description?'Approved BR':'Missing BR evidence';status=item.description?'planned':'placeholder';}
   else if(id==='project'||id==='issuetype'||id==='parent'||id==='labels'){display='ATGV managed Jira field';source='Jira project and issue hierarchy';status='planned';}
   else if(hasOld){display=existingValueText(old);source='Existing Jira';status='preserved';}
   else if(hasDefault){display='Jira default';source='Jira';status='default';}
   else {display=MISSING;source='Missing BR evidence · preview-only for non-text fields';}
  }else{
   const mapped=availableText(raw,item,context);
   const writable=raw.writable!==false&&(!Array.isArray(raw.operations)||!raw.operations.length||raw.operations.includes('set'));
   const textual=type==='string'&&(/^customfield_\d+$/.test(id)||id==='environment');
   if(textual&&writable&&mapped&&mapped.text.length>(custom.includes('textarea')||id==='environment'?32000:250)){
    display=MISSING;source=mapped.source;status='too-long';
    blocking.push(name+' ('+id+') has '+mapped.text.length+' source characters, which exceeds the safe Jira text-field size. Review the complete BR evidence; no content was truncated.');
   }else if(textual&&writable&&mapped){
    display=mapped.text;source=mapped.source;status='planned';
    value=custom.includes('textarea')||id==='environment'?toRichText(mapped.text):mapped.text;
   }else if(hasOld){
    display=existingValueText(old);source='Existing Jira';status='preserved';
   }else if(textual&&writable){
    display=MISSING;source='Missing BR evidence';status='placeholder';
    value=custom.includes('textarea')||id==='environment'?toRichText(MISSING):MISSING;
   }else if(hasDefault){
    display='Jira default';source='Jira';status='default';
   }else{display=MISSING;source='Missing BR evidence or supported Jira value · preview-only';status='not-available';}
   if(value!==undefined)extraFields[id]=value;
  }
  if(required&&status==='not-available'&&!hasOld&&!hasDefault)blocking.push(name+' ('+id+') requires a valid Jira value that the approved BR does not provide.');
  fields.push({id,name,type,required,status,source,display:display.slice(0,800),
   publishable:status==='planned'||status==='placeholder'&&value!==undefined||status==='preserved'||status==='default'});
 }
 const autofillSummary={total:fields.length,
  mapped:fields.filter(field=>field.status==='planned').length,
  textPlaceholders:fields.filter(field=>field.status==='placeholder'&&field.publishable).length,
  previewOnly:fields.filter(field=>!field.publishable).length,
  preserved:fields.filter(field=>field.status==='preserved').length,
  jiraDefaults:fields.filter(field=>field.status==='default').length,
  blocking:blocking.length};
 return {fields,extraFields,blocking,autofillSummary};
}
module.exports={MISSING,planFields,toRichText};
