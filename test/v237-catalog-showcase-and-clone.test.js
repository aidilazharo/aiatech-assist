'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const sdlc=require('../src/github-sdlc-catalog');
const showcase=require('../src/ux-framework-showcase');
const repos=require('../src/architect-repository');
const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
async function withTemp(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv237-'));try{return await run(root);}finally{await fs.rm(root,{recursive:true,force:true});}}
test('safe component showcase displays every component from repo JSON and escapes malicious fields',()=>{
 const catalogue={version:'1.0.0',components:[{name:'Button<script>alert(1)</script>',category:'action',classes:['qi-btn','" onmouseover="alert(1)'],use:'Click & <confirm>'},{name:'Table',category:'display',classes:['qi-table']} ]};
 const html=showcase.render(catalogue,{repository:'example-org/tech-stacks-skills',ref:'main',sha:'b'.repeat(40),version:'1.1.1'});
 assert.match(html,/2 components/);assert.match(html,/Button&lt;script&gt;/);assert.match(html,/&lt;confirm&gt;/);
 assert.doesNotMatch(html,/<script\b|<iframe\b|https:\/\//);
 assert.match(html,/default-src 'none'/);assert.match(html,/nonce-atgv-local-style/);
});
test('repository component inventory exists only in activated versioned catalog',()=>withTemp(async root=>{
 const ws=path.join(root,'work');await fs.mkdir(path.join(ws,'.atgv','catalog-assets','a'.repeat(40),'shared','design-systems','aia-qi','kit','ai'),{recursive:true});
 const base=path.join(ws,'.atgv','catalog-assets');const sha='a'.repeat(40),snapshot=path.join(base,sha);
 await fs.writeFile(path.join(base,'active.json'),JSON.stringify({sha,ref:'main',version:'1.1.1',repository:'example-org/tech-stacks-skills'}));
 await fs.writeFile(path.join(snapshot,'catalog.json'),JSON.stringify({schema:1,version:'1.1.1',roles:[],techStacks:[],designSystems:['aia-qi']}));
 const file=path.join(snapshot,'shared','design-systems','aia-qi','kit','ai','component-catalog.json');
 await assert.rejects(sdlc.designComponentCatalog(ws),/component inventory is missing from the active catalog/);
 const data={version:'1.0.0',components:[{name:'Button',category:'action',classes:['qi-btn']}]};await fs.writeFile(file,JSON.stringify(data));
 assert.equal((await sdlc.designComponentCatalog(ws)).components[0].name,'Button');
 assert.match(await sdlc.designComponentsReference(ws),/qi-btn/);
}));
test('save stack automatically clones only a missing approved project repo into project root',()=>withTemp(async root=>{
 const data=new Map();const state={get:key=>data.get(key),update:async(key,value)=>data.set(key,value)};
 let cloned=0;const git={repository:async p=>({root:p,remote:'https://github.com/example-org/tech-cockpit.git'}),matchesGithubRepo:(remote,owner,name)=>remote===`https://github.com/${owner}/${name}.git`,cloneConfigured:async(parent,owner,name)=>{cloned++;const target=path.join(parent,name);await fs.mkdir(target);return {root:target};}};
 await assert.rejects(repos.ensure(state,'test',git,{projectRoot:root,githubOwner:'example-org',githubRepo:'tech-stacks-skills',catalogRepositoryUrl:'https://github.com/example-org/tech-stacks-skills'}),/Library repository is not a project/);
 assert.equal(cloned,0);
 const checkout=await repos.ensure(state,'test',git,{projectRoot:root,githubOwner:'example-org',githubRepo:'tech-cockpit'});
 assert.equal(checkout,path.join(root,'repository','tech-cockpit'));assert.equal(cloned,1);
 assert.equal(data.get('atgvAssist.localRepo.test'),checkout);
 assert.equal(await repos.ensure(state,'test',git,{projectRoot:root,githubOwner:'example-org',githubRepo:'tech-cockpit'}),checkout);
 assert.equal(cloned,1);
}));
test('AIA Qi docs never opens external URLs and Bootstrap does not inherit Qi guide',()=>{
 const part=host.slice(host.indexOf("case 'uxFrameworkOpenDocs':{"),host.indexOf("case 'uxPrototypeOpenBrowser':{"));
 assert.doesNotMatch(part,/design\.aia\.com/);assert.match(part,/uxFrameworkCatalogueLoaded/);assert.match(part,/designComponentCatalog/);assert.doesNotMatch(part,/createWebviewPanel/);
 assert.match(host,/catalog\.designReference\(workspaceRoot,framework\)/);
 assert.match(host,/catalog\.designComponentsReference\(workspaceRoot,framework\)/);
 assert.match(host,/architectRepository\.ensure/);
});
test('catalog v1.1.1 integrity check rejects missing declared Qi kit assets',()=>{
 const entries=new Set(['roles/ux-designer/SKILL.md','tech-stacks/react/stack.json','tech-stacks/react/scaffold/index.html','shared/design-systems/aia-qi/AI-GUIDANCE.md']);
 const manifest={schema:1,version:'1.1.1',roles:['ux-designer'],techStacks:['react'],designSystems:['aia-qi'],designSystemCatalogs:{'aia-qi':{components:'shared/design-systems/aia-qi/kit/ai/component-catalog.json',showcase:'shared/design-systems/aia-qi/kit/docs/index.html',css:'shared/design-systems/aia-qi/kit/css/qi.css',tokens:'shared/design-systems/aia-qi/kit/tokens/tokens.json',license:'shared/design-systems/aia-qi/kit/LICENSE'}}};
 assert.throws(()=>sdlc.inspectManifest(Buffer.from(JSON.stringify(manifest)),entries),/Missing or unsafe design kit asset/);
 for(const v of Object.values(manifest.designSystemCatalogs['aia-qi']))entries.add(v);
 assert.equal(sdlc.inspectManifest(Buffer.from(JSON.stringify(manifest)),entries).designSystems[0],'aia-qi');
});
test('stack dependency installer has a recognized diagnostic kind',()=>{
 const logger=require('../src/architect-error-logs');logger.begin('project-1','install');logger.append('project-1','install','Step started');const report=logger.store({projectId:'project-1',kind:'install',error:'Mock failure',version:'0.2.44'});
 assert.equal(report.available,true);assert.match(logger.get('project-1','install').content,/Install Dependencies/);logger.clear('project-1','install');
});
