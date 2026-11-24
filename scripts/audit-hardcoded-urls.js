'use strict';
// Inventory literal URL fragments in extension-owned source, not tests or third-party dependencies.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const directories=['src','media','service','scripts'];
const files=['package.json'];
const exclude=/^(?:node_modules|vendor|dist|coverage|\.git|\.atgv)$/i;
function visit(relative){
 const full=path.join(root,relative);
 if(!fs.existsSync(full))return;
 if(fs.statSync(full).isDirectory()){
  for(const name of fs.readdirSync(full).sort()){
   if(!exclude.test(name))visit(path.join(relative,name));
  }
  return;
 }
 if(/\.(?:js|mjs|cjs|json|html|css|ts|svg|ya?ml)$/i.test(relative))files.push(relative);
}
for(const dir of directories)visit(dir);
const literal=/https?:\/\/[^\s"'<>\x60\\]+/g;
const found=new Map();
for(const file of files.sort()){
 const lines=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/);
 lines.forEach((line,index)=>{
  const clean=line.replace(/\\\//g,'/');
  const matches=clean.match(literal)||[];
  for(let raw of matches){
   raw=raw.replace(/[.,;)\]}]+$/g,'');
   if(!raw||raw.endsWith('//'))continue;
   const occurrences=found.get(raw)||[];
   occurrences.push(file+':'+(index+1));
   found.set(raw,occurrences);
  }
 });
}
console.log('HARD_CODED_URL_INVENTORY_BEGIN');
for(const [url,locations] of [...found].sort(([a],[b])=>a.localeCompare(b))){
 console.log(JSON.stringify({url,locations:locations.slice(0,12),occurrences:locations.length}));
}
console.log('HARD_CODED_URL_INVENTORY_END');
console.log('Scanned '+files.length+' extension-owned files; '+found.size+' unique literal URL fragments.');
