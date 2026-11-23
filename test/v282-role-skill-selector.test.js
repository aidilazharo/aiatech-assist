'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const catalog=require('../src/github-sdlc-catalog');
const descriptor=require('../src/role-skill-identifier');
const {execFileSync}=require('node:child_process');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function fixture(fn){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-role-variants-'));
 const workspace=path.join(temp,'workspace'),checkout=path.join(workspace,'.atgv','library','repository');
 const root=path.join(checkout,'roles','business-analyst');
 await fs.mkdir(path.join(root,'skills','waterfall'),{recursive:true});
 await fs.writeFile(path.join(root,'SKILL.md'),'---\nid: ba.standard\n---\nStandard guidance');
 await fs.writeFile(path.join(root,'skills','agile.md'),'---\nid: ba.agile\n---\nAgile role guidance');
 await fs.writeFile(path.join(root,'skills','waterfall','SKILL.md'),'---\nid: ba.waterfall\n---\nWaterfall role guidance');
 await fs.writeFile(path.join(checkout,'catalog.json'),JSON.stringify({schema:1,version:'1.1.3',roles:['business-analyst'],techStacks:[]}));
 git(checkout,'init','-b','main');git(checkout,'config','user.name','ATGV test');git(checkout,'config','user.email','test@example.invalid');git(checkout,'add','.');git(checkout,'commit','-m','catalog fixtures');
 const sha=git(checkout,'rev-parse','HEAD');
 await fs.writeFile(path.join(workspace,'.atgv','library-state.json'),JSON.stringify({sha,ref:'main',repository:'example/skills',version:'1.1.3',roles:['business-analyst'],roleCount:1}));
 try{return await fn({workspace,checkout,root})}finally{await fs.rm(temp,{recursive:true,force:true})}
}
test('one checkout exposes standard and alternate BA variants and reads chosen verified content',async()=>fixture(async({workspace})=>{
 const options=await catalog.roleSkillChoices(workspace,'business-analyst');
 assert.deepEqual(options.map(x=>x.id),['ba.standard','ba.agile','ba.waterfall']);
 assert.equal(options.filter(x=>x.default).length,1);
 assert.equal(options[0].label,'ba.standard');
 assert.match(await catalog.roleSkill(workspace,'business-analyst','ba.agile'),/Agile role guidance/);
 assert.match(await catalog.roleSkill(workspace,'business-analyst','ba.waterfall'),/Waterfall role guidance/);
 assert.match(await catalog.roleSkill(workspace,'business-analyst'),/Standard guidance/);
 await assert.rejects(catalog.roleSkill(workspace,'business-analyst','../../secret'),/unavailable/);
 await assert.rejects(catalog.roleSkillChoices(workspace,'../../secret'),/Invalid catalog role ID/);
}));
test('alternative skill identifiers are validated against their catalog paths and symlinks are not loaded',async()=>fixture(async({workspace,root})=>{
 assert.throws(()=>descriptor.describe('business-analyst','---\nid: ba.bad\n---','roles/business-analyst/skills/../../private.md'),/Invalid/);
 await fs.symlink(path.join(root,'SKILL.md'),path.join(root,'skills','bad.md'));
 const choices=await catalog.roleSkillChoices(workspace,'business-analyst');
 assert.deepEqual(choices.map(o=>o.id),['ba.standard','ba.agile','ba.waterfall']);
}));
test('no invented options when a role has only its default SKILL.md',async()=>fixture(async({workspace,root})=>{
 await fs.rm(path.join(root,'skills'),{recursive:true,force:true});
 assert.deepEqual((await catalog.roleSkillChoices(workspace,'business-analyst')).map(x=>x.id),['ba.standard']);
}));
