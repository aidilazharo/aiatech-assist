/* Offline-only API contract simulator for ATGV Solution Designs.
 * Pure local preview; no network requests or credentials. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.ATGVApiSimulator=api;
})(typeof globalThis!=='undefined'?globalThis:undefined,function(){
 'use strict';
 const scenarios={success:null,unauthorized:[401,'Unauthorized'],forbidden:[403,'Forbidden'],notFound:[404,'Not Found'],conflict:[409,'Conflict'],validation:[422,'Unprocessable Entity'],server:[500,'Internal Server Error']};
 const stringify=value=>JSON.stringify(value,null,2);
 function sample(schema,depth=0){
  if(depth>5||!schema||typeof schema!=='object'||Array.isArray(schema))return null;
  if(Object.prototype.hasOwnProperty.call(schema,'example'))return schema.example;
  if(Object.prototype.hasOwnProperty.call(schema,'default'))return schema.default;
  if(Array.isArray(schema.enum)&&schema.enum.length)return schema.enum[0];
  const type=Array.isArray(schema.type)?schema.type.find(t=>t!=='null'):schema.type;
  if(type==='object'||schema.properties){const value={};for(const [key,sub] of Object.entries(schema.properties||{}).slice(0,30)){if(key==='__proto__'||key==='constructor'||key==='prototype')continue;value[key]=sample(sub,depth+1)}return value;}
  if(type==='array')return schema.items?[sample(schema.items,depth+1)]:[];
  if(type==='integer'||type==='number')return 0;
  if(type==='boolean')return false;
  if(type==='string')return schema.format==='date-time'?'2026-01-01T00:00:00Z':schema.format==='date'?'2026-01-01':schema.format==='uuid'?'00000000-0000-4000-8000-000000000001':'example';
  return null;
 }
 function initialRequest(endpoint){
  const schema=endpoint?.requestSchema;
  return stringify(schema?sample(schema):{});
 }
 function validationErrors(value,schema,depth=0,field='request'){
  if(!schema||typeof schema!=='object'||depth>5)return [];
  const errors=[];
  const type=Array.isArray(schema.type)?schema.type[0]:schema.type;
  if((type==='object'||schema.properties)&&(!value||typeof value!=='object'||Array.isArray(value)))return [field+' must be an object'];
  if(type==='array'&&!Array.isArray(value))return [field+' must be an array'];
  if(type==='string'&&typeof value!=='string')return [field+' must be a string'];
  if((type==='integer'||type==='number')&&(typeof value!=='number'||!Number.isFinite(value)||(type==='integer'&&!Number.isInteger(value))))return [field+' must be a number'];
  if(type==='boolean'&&typeof value!=='boolean')return [field+' must be a boolean'];
  for(const key of Array.isArray(schema.required)?schema.required:[]){if(!Object.prototype.hasOwnProperty.call(value||{},key))errors.push(field+'.'+key+' is required');}
  for(const [key,sub] of Object.entries(schema.properties||{}).slice(0,30))if(value&&Object.prototype.hasOwnProperty.call(value,key))errors.push(...validationErrors(value[key],sub,depth+1,field+'.'+key));
  return errors.slice(0,15);
 }
 function simulate(endpoint,options={}){
  const method=String(endpoint?.method||'GET').toUpperCase();
  let path=String(endpoint?.path||'/');
  const params=options.params||{};
  const missing=[];
  path=path.replace(/\{([^{}]+)\}/g,(match,key)=>{
   const value=String(params[key]??'').trim();if(!value){missing.push(key);return match;}
   return encodeURIComponent(value);
  });
  if(missing.length)return {status:400,label:'Bad Request',requestPath:path,headers:{'Content-Type':'application/json'},body:{error:'Missing path parameter',fields:missing},simulated:true};
  let request=null;
  if(!['GET','DELETE'].includes(method)&&options.requestText!==undefined){
   if(String(options.requestText).length>24000)return {status:413,label:'Payload Too Large',requestPath:path,headers:{},body:{error:'Request example exceeds 24 KB'},simulated:true};
   try{request=JSON.parse(options.requestText)}catch{return {status:400,label:'Bad Request',requestPath:path,headers:{},body:{error:'Invalid JSON request body'},simulated:true};}
   const errors=validationErrors(request,endpoint.requestSchema);
   if(errors.length)return {status:422,label:'Unprocessable Entity',requestPath:path,headers:{'Content-Type':'application/json'},body:{error:'Draft schema validation failed',details:errors},simulated:true};
  }
  const scenario=Object.prototype.hasOwnProperty.call(scenarios,options.scenario)?options.scenario:'success';
  if(scenario!=='success'){
   const [status,label]=scenarios[scenario];return {status,label,requestPath:path,headers:{'Content-Type':'application/json'},body:{error:label,detail:'Simulated '+label.toLowerCase()+' scenario; not a documented live server response.'},simulated:true};
  }
  const status=method==='POST'?201:method==='DELETE'?204:200;
  const contract=!!endpoint?.responseSchema;
  const body=status===204?null:contract?sample(endpoint.responseSchema):{message:'Response schema not specified in this draft',description:String(endpoint?.response||'').slice(0,500)};
  return {status,label:status===201?'Created':status===204?'No Content':'OK',requestPath:path,headers:status===204?{}:{'Content-Type':'application/json'},body,contract,simulated:true};
 }
 return Object.freeze({sample,initialRequest,validationErrors,simulate,scenarios});
});
