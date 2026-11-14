'use strict';
// Test-only local mock of a previously pulled and activated GitHub main catalog.
// The fixture is excluded from the installable VSIX (test/** in .vscodeignore).
const fs=require('node:fs/promises');const path=require('node:path');
const SHA='f'.repeat(40);
async function activate(workspace){
 const assets=path.join(workspace,'.atgv','catalog-assets');
 await fs.mkdir(assets,{recursive:true});
 await fs.cp(path.join(__dirname,'fixtures','catalog'),path.join(assets,SHA),{recursive:true,force:true});
 await fs.writeFile(path.join(assets,'active.json'),JSON.stringify({sha:SHA,ref:'main',repository:'example-org/tech-stacks-skills',version:'1.1.0'}));
 return {workspace,sha:SHA};
}
module.exports={activate,SHA};
