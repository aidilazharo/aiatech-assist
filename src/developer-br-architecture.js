'use strict';
// Read-only evidence from generated files. Never infer endpoints or tables without source evidence.
const fs=require('node:fs/promises');
const path=require('node:path');
const pipeline=require('./developer-br-pipeline');
function splitSqlColumns(text){
 const columns=[];let depth=0,quote='',start=0;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quote){if(c===quote&&text[i-1]!=='\\')quote='';continue;}
  if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
  if(c==='(')depth++;else if(c===')')depth=Math.max(0,depth-1);
  if(c===','&&depth===0){columns.push(text.slice(start,i));start=i+1;}
 }
 columns.push(text.slice(start));
 return columns.map(c=>c.trim().replace(/\s+/g,' ')).filter(Boolean).slice(0,35);
}
function parseSqlTables(file,body){
 const tables=[];
 // DDL can be inside SQL files or JS `db.exec(`...`)` template literals.
 // Match exactly the balanced CREATE TABLE (...) content, not through the next
 // JavaScript call or semicolon. This also supports type parameters such as VARCHAR(255).
 const begins=/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`\[]?([\w.-]+)["'`\]]?\s*\(/gi;
 for(const match of body.matchAll(begins)){
  let depth=1,close=-1,quote='';const start=match.index+match[0].length;
  for(let i=start;i<body.length&&i<start+6500;i++){
   const c=body[i];
   if(quote){if(c===quote&&body[i-1]!=='\\')quote='';continue;}
   if(c==='"'||c==="'"){quote=c;continue;}
   if(c==='(')depth++;else if(c===')'&&--depth===0){close=i;break;}
  }
  if(close<0)continue;
  tables.push({name:match[1],file,columns:splitSqlColumns(body.slice(start,close))});
 }
 return tables;
}
function parseArchitecture(contents){
 const tables=[],endpoints=[];
 for(const item of contents){
  const file=String(item.path||''),body=String(item.content||'');
  if(/(?:sql|schema|prisma|migrat|db|database|server)/i.test(file)){
   tables.push(...parseSqlTables(file,body));
   for(const m of body.matchAll(/\bmodel\s+(\w+)\s*\{([^}]{1,5000})\}/g)){
    tables.push({name:m[1],file,columns:m[2].split('\n').map(c=>c.trim()).filter(Boolean).slice(0,35)});
   }
  }
  if(/\.(?:[cm]?js|ts|jsx|tsx)$/.test(file)){
   for(const m of body.matchAll(/\b(?:app|router|server|fastify)\s*\.\s*(get|post|put|patch|delete|options)\s*\(\s*['"`]([^'"`]{1,160})['"`]/gi))endpoints.push({method:m[1].toUpperCase(),path:m[2],file});
   for(const m of body.matchAll(/\b(?:fetch)\s*\(\s*['"`]([^'"`]{1,160})['"`]/gi)){
    if(m[1].startsWith('/api/'))endpoints.push({method:'CLIENT',path:m[1],file});
   }
  }
 }
 const unique=(rows,key)=>[...new Map(rows.map(r=>[key(r),r])).values()];
 return {tables:unique(tables,r=>r.name+':'+r.file).slice(0,30),endpoints:unique(endpoints,r=>r.method+':'+r.path+':'+r.file).slice(0,80),files:contents.map(x=>x.path)};
}
async function inspect(worktree,paths){
 const output=[];
 if(!worktree||!Array.isArray(paths))return {tables:[],endpoints:[],files:[]};
 let root;try{root=await fs.realpath(worktree);}catch{return {tables:[],endpoints:[],files:[]};}
 for(const name of paths.slice(0,90)){
  let safe;try{safe=pipeline.safeRelative(name);}catch{continue;}
  if(!/(?:sql|prisma|mjs|cjs|jsx?|tsx?)$/i.test(safe))continue;
  const full=path.join(root,safe);
  const st=await fs.lstat(full).catch(()=>null);
  if(!st?.isFile()||st.isSymbolicLink()||st.size>125000)continue;
  const content=await fs.readFile(full,'utf8').catch(()=>null);
  if(content!==null)output.push({path:safe,content});
 }
 return parseArchitecture(output);
}
module.exports={parseArchitecture,inspect};
