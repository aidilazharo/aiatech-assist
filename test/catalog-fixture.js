'use strict';
// Test-only local mock of a previously pulled and activated GitHub main catalog.
// The fixture is excluded from the installable VSIX (test/** in .vscodeignore).
const fs=require('node:fs/promises');const path=require('node:path');
const SHA='f'.repeat(40);
// Canonicalize text only in the copied test catalog, never in user code.
async function canonicalizeFixture(dir){
 for(const item of await fs.readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,item.name);
  if(item.isDirectory())await canonicalizeFixture(file);
  else if(item.isFile()){
   const bytes=await fs.readFile(file),raw=bytes.toString('utf8');
   if(!raw.includes('\0')&&Buffer.from(raw,'utf8').equals(bytes)&&raw.includes('\r\n'))
    await fs.writeFile(file,raw.replace(/\r\n/g,'\n'));
  }
 }
}
async function activate(workspace){
 const assets=path.join(workspace,'.atgv','catalog-assets');
 await fs.mkdir(assets,{recursive:true});
 await fs.cp(path.join(__dirname,'fixtures','catalog'),path.join(assets,SHA),{recursive:true,force:true});
 await canonicalizeFixture(path.join(assets,SHA));
 await fs.writeFile(path.join(assets,'active.json'),JSON.stringify({sha:SHA,ref:'main',repository:'example-org/tech-stacks-skills',version:'1.1.0'}));
 return {workspace,sha:SHA};
}
module.exports={activate,SHA};
