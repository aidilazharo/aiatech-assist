'use strict';

const fieldValues=require('./jira-field-values');
const jiraDetails=require('./jira-preview-details');
const MISSING='Information not available in the approved Business Requirements document.';
const assigned=new Set(['project','issuetype','summary','description','parent','labels']);
const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const has=fieldValues.hasValue;

function namedEvidence(field,item,{approvedBR={},discoveryAnswers={}}){
 const wanted=normalize(field.name);
 const saved=[jiraDetails.baseDescription(item),approvedBR.objective,approvedBR.scope,...Object.values(discoveryAnswers)];
 const matching=new Set();
 for(const block of saved){
  if(typeof block!=='string')continue;
  for(const line of block.split('\n')){
   const match=/^\s*(?:[-*]\s+)?([^:=]{1,130})\s*[:=]\s*(.+)$/.exec(line);
   if(match&&normalize(match[1])===wanted)matching.add(match[2].trim());
  }
 }
 return matching.size===1?[...matching][0]:'';
}

function availableText(field,item,details,{approvedBR={},discoveryAnswers={}}={}){
 const key=normalize(field.name);
 const section=jiraDetails.fieldSection(field.name);
 if(section&&details[section])return {text:details[section],source:'Issue-specific '+(section==='acceptanceCriteria'?'acceptance criteria':'Definition of Done')};
 const exact=namedEvidence(field,item,{approvedBR,discoveryAnswers});
 if(exact)return {text:exact,source:'Named field in approved BR evidence'};
 const mappings=[
  [/^(epic name|issue name|requirement title)$/,item.title],
  [/^(business requirement id|br id|br reference)$/,String(item.path||'').split('/')[0]],
  [/^(detailed description|business description|requirement description)$/,jiraDetails.baseDescription(item)],
  [/^(business rules?|policy)$/,discoveryAnswers.businessRules],
  [/^(business objective|business outcome|business value)$/,approvedBR.objective||discoveryAnswers.problem],
  [/^(scope|in scope)$/,approvedBR.scope||discoveryAnswers.scope],
  [/^stakeholders?$/,discoveryAnswers.stakeholders],
  [/^(success criteria|success measure)$/,discoveryAnswers.measures],
  [/^(dependency|dependencies)$/,discoveryAnswers.dependencies],
  [/^(constraints?|non functional requirements?)$/,discoveryAnswers.constraints]
 ];
 for(const [pattern,value] of mappings){
  if(pattern.test(key)&&typeof value==='string'&&value.trim())return {text:value.trim(),source:'Approved BR and saved discovery'};
 }
 return null;
}

function valueText(field,value){
 if(!has(value))return '';
 const editor=fieldValues.editorValue(field,value);
 if(Array.isArray(editor))return editor.join(', ');
 return editor||'Existing Jira value';
}

function planFields(item, metadata, context={}){
 if(!Array.isArray(metadata))throw Error('Jira did not return valid issue field metadata.');
 const fields=[],extraFields={},blocking=[],seen=new Set(),mappedSections=new Set();
 const existing=context.existing?.fields||{};
 const details=jiraDetails.generalize(item,context.approvedBR,context.template);
 const overrides=item.jiraDetails?.fieldValues||{};
 for(const raw of metadata){
  const id=String(raw?.id||''),name=String(raw?.name||id).slice(0,160);
  if(!id||seen.has(id))continue;
  seen.add(id);
  const type=String(raw?.schema?.type||'unknown');
  const required=raw.required===true,hasDefault=raw.hasDefaultValue===true;
  const old=existing[id],hasOld=has(old)&&valueText(raw,old)!==MISSING,editable=fieldValues.isEditable(raw);
  const section=jiraDetails.fieldSection(name);
  const detailText=section&&type==='string'&&!raw.allowedValues?.length;
  let display=MISSING,source='Missing Jira value',status='not-available',value;

  if(assigned.has(id)){
   status='planned';
   source='Approved BR and Jira hierarchy';
   display=id==='summary'?item.title:id==='description'?'Jira description': 'ATGV managed Jira field';
  }else if(editable&&Object.hasOwn(overrides,id)){
   try{
    value=fieldValues.encode(raw,overrides[id]);
    display=valueText(raw,value);
    source='BA edit';
    status='planned';
    if(detailText&&has(value))mappedSections.add(section);
   }catch(error){blocking.push(name+' ('+id+'): '+error.message);}
  }else if(editable&&fieldValues.canGeneralize(raw)&&(required||!context.selectedFields||context.selectedFields.includes(id))){
   const mapped=availableText(raw,item,details,context);
   if(mapped){
    const full=detailText&&!fieldValues.richText(raw)?mapped.text.replace(/\s*\n+\s*/g,' · '):mapped.text;
    try{
     value=fieldValues.encode(raw,full);
     display=valueText(raw,value);
     source=mapped.source;
     status='planned';
     if(detailText)mappedSections.add(section);
    }catch(error){
     if(detailText&&!fieldValues.richText(raw)&&full.length>250){
      value='See '+(section==='acceptanceCriteria'?'acceptance criteria':'Definition of Done')+' in the issue description.';
      display=value;source=mapped.source;status='planned';
     }else if(/No content was truncated/.test(error.message)){
      status='too-long';source=mapped.source;
      blocking.push(name+' ('+id+'): '+error.message);
     }else source=mapped.source+' needs a compatible Jira value';
    }
   }
   if(status==='not-available'&&!hasOld&&!hasDefault&&source==='Missing Jira value'){
    status='missing-evidence';
    source='Missing approved BR evidence';
   }
  }

  if(status==='not-available'&&!required&&context.selectedFields&&!context.selectedFields.includes(id)&&!hasOld&&!hasDefault){status='not-selected';source='BA field selection';}
  if(status==='not-available'&&hasOld){
   display=valueText(raw,old);source='Existing Jira';status='preserved';
  }else if(status==='not-available'&&hasDefault){
   display=valueText(raw,raw.defaultValue)||'Jira default';source='Jira';status='default';
  }
  if(required&&['not-available','missing-evidence'].includes(status))blocking.push(name+' ('+id+') requires real approved Jira evidence; a placeholder cannot be published.');
  if(value!==undefined&&!fieldValues.sameValue(raw,old,value))extraFields[id]=value;
  const editor=fieldValues.editorField(raw,value!==undefined?value:hasOld?old:raw.defaultValue);
  fields.push({id,name,type,required,status,source,display:String(display||'').slice(0,800),editor,detailText,
   publishable:['planned','preserved','default'].includes(status)});
 }

 for(const id of Object.keys(overrides)){
  if(!seen.has(id))blocking.push('Saved Jira field '+id+' is no longer available. Remove that saved value or restore the field in Jira.');
 }

 const description=jiraDetails.publishDescription(item,details,mappedSections);
 const body=fields.find(field=>field.id==='description');
 if(body)body.display=description.slice(0,800);
 const updateCore={};
 if(item.action==='update'){
  const live={summary:String(existing.summary||''),description:fieldValues.richTextValue(existing.description)};
  for(const [id,proposed] of Object.entries({summary:item.title,description})){
   if(live[id]===proposed)continue;
   if(metadata.some(field=>field.id===id&&fieldValues.canSet(field)))updateCore[id]=proposed;
   else blocking.push('Jira '+id+' is unavailable on the edit screen for '+item.key+'.');
  }
 }

 return {fields,extraFields,blocking,details,description,updateCore,baseDescription:jiraDetails.baseDescription(item),schema:fieldValues.schemaFingerprint(metadata),
  autofillSummary:{total:fields.length,mapped:fields.filter(field=>field.status==='planned').length,
   textPlaceholders:0,missingEvidence:fields.filter(field=>field.status==='missing-evidence').length,
   previewOnly:fields.filter(field=>!field.publishable).length,
   preserved:fields.filter(field=>field.status==='preserved').length,
   jiraDefaults:fields.filter(field=>field.status==='default').length,blocking:blocking.length}};
}

module.exports={MISSING,planFields,toRichText:fieldValues.toRichText};
