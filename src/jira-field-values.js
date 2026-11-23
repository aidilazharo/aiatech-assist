'use strict';

const {textFromAdf,sha}=require('./utils');

const standardFields=new Set(['environment','priority','duedate','components','fixVersions','versions']);
const references=new Set(['option','component','version','priority','user','group','securitylevel']);
const customField=/^customfield_\d+$/;
const hasValue=value=>value!==undefined&&value!==null&&value!==''&&!(Array.isArray(value)&&!value.length);
const canSet=field=>field.writable!==false&&(!field.operations?.length||field.operations.includes('set'));
const typeOf=field=>String(field.schema?.type||'');
const isArray=field=>typeOf(field)==='array';
const valueType=field=>isArray(field)?String(field.schema?.items||''):typeOf(field);
const richText=field=>field.id==='environment'||/textarea/i.test(field.schema?.custom||'');
const normalized=value=>String(value??'').trim().toLowerCase();

function isEditable(field){
 const type=valueType(field);
 if(!canSet(field)||!(customField.test(field.id)||standardFields.has(field.id)))return false;
 if(/cascadingselect|gh-epic-link|gh-sprint|locked/i.test(field.schema?.custom||''))return false;
 return richText(field)||['string','number','integer','boolean','date','datetime'].includes(type)||references.has(type);
}

function toRichText(text){
 return {type:'doc',version:1,content:String(text).split('\n').map(line=>({
  type:'paragraph',content:line?(line.match(/[\s\S]{1,10000}/gu)||[]).map(text=>({type:'text',text})):[]
 }))};
}

function optionToken(value){
 if(typeof value==='string'||typeof value==='number')return String(value);
 return String(value?.accountId??value?.groupId??value?.id??value?.value??value?.name??'');
}

function optionRows(field){
 return (field.allowedValues||[]).filter(value=>value?.disabled!==true).flatMap(value=>{
  const token=optionToken(value);
  if(!token)return [];
  return [{
   value:token,
   label:String(value?.displayName??value?.name??value?.value??token),
   aliases:[token,value?.name,value?.value,value?.displayName].filter(hasValue)
  }];
 });
}

function canGeneralize(field){return !references.has(valueType(field))||optionRows(field).length>0;}

function editorValue(field,value){
 if(!hasValue(value))return isArray(field)?[]:'';
 if(richText(field))return typeof value==='string'?value:richTextValue(value);
 if(isArray(field))return (Array.isArray(value)?value:[value]).map(optionToken);
 if(typeof value==='object')return optionToken(value);
 return String(value);
}

function richTextValue(value){
 if(!value||value.type!=='doc'||!Array.isArray(value.content))return textFromAdf(value);
 return value.content.map(block=>{
  if(block.type==='paragraph'&&(block.content||[]).every(node=>node.type==='text'))return (block.content||[]).map(node=>node.text).join('');
  return textFromAdf(block);
 }).join('\n');
}

function editorField(field,value){
 if(!isEditable(field))return null;
 const options=optionRows(field).map(({value,label})=>({value,label}));
 const kind=options.length?'select':richText(field)||isArray(field)?'textarea':valueType(field)==='date'?'date':valueType(field)==='boolean'?'boolean':'text';
 return {id:field.id,name:field.name,required:!!field.required,kind,multiple:isArray(field),value:editorValue(field,value),options};
}

function optionValue(field,raw){
 const all=optionRows(field);
 const exact=all.find(option=>option.value===raw);
 const matching=all.filter(option=>option.aliases.some(alias=>normalized(alias)===normalized(raw)));
 const selected=exact??(matching.length===1?matching[0]:null);
 if(all.length&&!selected)throw Error('Choose an available Jira option.');
 const token=selected?.value??raw;
 switch(valueType(field)){
  case 'user':
   if(!/^[A-Za-z0-9_.:-]{1,128}$/.test(token))throw Error('Enter a Jira account ID.');
   return {accountId:token};
  case 'group':
   return /^\d+$|^[a-f\d]{8}-[a-f\d-]{27}$/i.test(token)?{groupId:token}:{name:token};
  case 'option':
   if(!all.length&&!/^\d+$/.test(token))throw Error('Enter a Jira option ID.');
   return /^\d+$/.test(token)?{id:token}:{value:token};
  case 'component':case 'version':case 'priority':case 'securitylevel':
   if(!/^\d+$/.test(token))throw Error('Enter a Jira value ID.');
   return {id:token};
  default:return token;
 }
}

function scalarValue(field,raw){
 const type=valueType(field);
 if(richText(field)){
  if(raw.length>32000)throw Error('Jira long text exceeds 32,000 characters. No content was truncated.');
  return toRichText(raw);
 }
 if(optionRows(field).length||references.has(type))return optionValue(field,raw);
 if(type==='number'||type==='integer'){
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)||!Number.isFinite(Number(raw))||(type==='integer'&&!Number.isSafeInteger(Number(raw))))throw Error('Enter a valid Jira number.');
  return Number(raw);
 }
 if(type==='boolean'){
  if(!/^(true|false)$/i.test(raw))throw Error('Choose true or false.');
  return normalized(raw)==='true';
 }
 if(type==='date'){
  if(!/^\d{4}-\d\d-\d\d$/.test(raw)||!Number.isFinite(Date.parse(raw))||new Date(raw).toISOString().slice(0,10)!==raw)throw Error('Enter a valid date in YYYY-MM-DD format.');
  return raw;
 }
 if(type==='datetime'){
  if(!/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:?\d\d)$/.test(raw)||!Number.isFinite(Date.parse(raw)))throw Error('Enter an ISO date and time with a timezone.');
  return raw;
 }
 if(raw.length>250)throw Error('Jira single-line text exceeds 250 characters. No content was truncated.');
 if(/[\r\n]/.test(raw))throw Error('Enter text on one line.');
 return raw;
}

function encode(field,input){
 if(!isEditable(field))throw Error('This field is unavailable for editing.');
 const list=isArray(field);
 if(typeof input!=='string'&&!(list&&Array.isArray(input)&&input.every(value=>typeof value==='string')))throw Error('Invalid Jira field input.');
 const raw=list?(Array.isArray(input)?input:input.split(/\r?\n/)).map(value=>value.trim()).filter(Boolean):input.trim();
 if((list?raw:[raw]).some(v=>v==='Information not available in the approved Business Requirements document.'))
  throw Error('Replace the missing-information placeholder with actual approved evidence.');
 if(list?!raw.length:!raw){
  if(field.required)throw Error('This Jira field is required.');
  return list?[]:null;
 }
 if(list){
  if(raw.length>100)throw Error('Too many Jira field values.');
  return [...new Set(raw)].map(value=>scalarValue(field,value));
 }
 return scalarValue(field,raw);
}

function sameValue(field,a,b){
 const left=editorValue(field,a),right=editorValue(field,b);
 if(isArray(field))return JSON.stringify([...left].sort())===JSON.stringify([...right].sort());
 if(valueType(field)==='datetime'&&left&&right)return Date.parse(left)===Date.parse(right);
 return left===right;
}

function editedValues(metadata,inputs,existing={}){
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||Object.keys(inputs).length>100)throw Error('Invalid Jira field changes.');
 const byId=new Map(metadata.map(field=>[field.id,field]));
 const fields={};
 for(const [id,input] of Object.entries(inputs)){
  const field=byId.get(id);
  if(!field||!isEditable(field))throw Error('Jira field '+id+' is no longer editable. Refresh Jira fields.');
  try{
   const value=encode(field,input);
   if(!sameValue(field,existing[id],value))fields[id]=value;
  }catch(error){throw Error(field.name+': '+error.message);}
 }
 return fields;
}

function schemaFingerprint(metadata){
 return sha(JSON.stringify(metadata.map(field=>({
  id:field.id,name:field.name,schema:Object.fromEntries(Object.entries(field.schema||{}).sort(([a],[b])=>a.localeCompare(b))),required:!!field.required,writable:canSet(field),
  hasDefaultValue:!!field.hasDefaultValue,defaultValue:editorValue(field,field.defaultValue),
  options:optionRows(field).sort((a,b)=>a.value.localeCompare(b.value))
 })).sort((a,b)=>a.id.localeCompare(b.id))));
}

module.exports={isEditable,hasValue,canSet,canGeneralize,richText,toRichText,richTextValue,editorValue,editorField,encode,sameValue,editedValues,schemaFingerprint};
