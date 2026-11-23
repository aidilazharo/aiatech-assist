'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),os=require('node:os'), fsp=require('node:fs/promises');
const catalog=require('../src/github-sdlc-catalog');
const repos=require('../src/architect-repository');
const ext=fs.readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
test('generic catalog defaults stay neutral but ATGV fixes its verified Library source',()=>{
 assert.equal(catalog.DEFAULT_CONFIG.repositoryUrl,'');
 assert.match(ext,/startupSetup\.FIXED_LIBRARY_REPOSITORY/);
 assert.match(ext,/https:\/\/github\.com\/aidilazharo\/tech-stacks-skills/);
 // The reusable catalog module stays neutral while ATGV host pins its trusted source.
 assert.doesNotMatch(catalog.DEFAULT_CONFIG.repositoryUrl,/aidilazharo/i);
 assert.equal(catalog.normalizeConfig({...catalog.DEFAULT_CONFIG,repositoryUrl:'https://github.com/your-team/catalog'}).repositoryUrl,'https://github.com/your-team/catalog');
});
test('catalog exclusion is configured per owner, without a named account hardcode',async()=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'atgv254-'));
 try{
 const state={get:()=>undefined};const git={repository:async()=>{throw Error('no checkout');}};
 await assert.rejects(repos.ensure(state,'p',git,{projectRoot:root,githubOwner:'another-team',githubRepo:'catalog',catalogRepositoryUrl:'https://github.com/another-team/catalog'}),/Library repository/);
 } finally {await fsp.rm(root,{recursive:true,force:true});}
});
