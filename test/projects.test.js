'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ProjectRegistry,projectSlug,normalizeProjectInput,normalizeExtensionSettings,projectConfig,parseRepoUrl,normalizeGithubRepository}=require('../src/projects');
const {KnowledgeStore}=require('../src/knowledge');

const data=(id,name,space,jql,repo)=>({id,name,settings:{
  atlassian:{baseUrl:'https://example.atlassian.net',email:'user@company.com'},
  jira:{jql},confluence:{spaceKey:space,parentPageId:''},
  github:{owner:'my-org',repo,branch:'main',pathPrefix:'docs',apiUrl:'https://api.github.com'}
}});

test('project slugs are filesystem-safe and invalid IDs are rejected',()=>{
  assert.equal(projectSlug('Claims & Payments!'),'claims-payments');
  assert.equal(projectSlug('../../etc'),'etc');
  assert.throws(()=>projectSlug('123'));
  assert.throws(()=>normalizeProjectInput(data('../secret','Not Safe','KB','project = A','docs')));
  assert.throws(()=>normalizeProjectInput({...data('okay','Okay','KB','project = A','docs'),settings:{...data('okay','Okay','KB','project = A','docs').settings,confluence:{spaceKey:'KB',parentPageId:'../../'}}}));
});

test('multiple projects maintain separate Jira, Confluence and GitHub settings',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-projects-'));
  try{
    const registry=new ProjectRegistry(root);
    const a=await registry.create(data('claims','Claims','CLM','project = CLM','claims-docs'));
    const b=await registry.create(data('support','Support','SUP','project = SUP','support-docs'));
    assert.equal((await registry.list()).length,2);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'projects','claims','atgv.project.json'),'utf8')).settings.github.repo,'claims-docs');
    const global={get(key,def){return key==='rag.maxChunks'?9:def;}};
    assert.equal(projectConfig(a,global).get('jira.jql'),'project = CLM');
    assert.equal(projectConfig(b,global).get('jira.jql'),'project = SUP');
    assert.equal(projectConfig(a,global).get('confluence.spaceKey'),'CLM');
    assert.equal(projectConfig(b,global).get('confluence.spaceKey'),'SUP');
    assert.equal(projectConfig(a,global).get('github.repo'),'claims-docs');
    assert.equal(projectConfig(b,global).get('github.repo'),'support-docs');
    assert.equal(projectConfig(a,{},global).get('rag.maxChunks'),9);
    assert.equal(Object.keys(a).includes('token'),false);
    assert.throws(()=>registry.fileFor('../support'));
    await assert.rejects(()=>registry.create(data('claims','Duplicate','CLM','project = CLM','docs')),{code:'EEXIST'});
    await registry.update('claims',{...data('not-claims','Claims v2','CLM','project = CLM AND status = Open','new-repo')});
    assert.equal((await registry.read('claims')).id,'claims');
    assert.equal((await registry.read('claims')).settings.github.repo,'new-repo');
    assert.equal((await registry.read('support')).settings.github.repo,'support-docs');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('project-specific RAG indexes do not contaminate other project results',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-rag-projects-'));
  try{
    const a=new KnowledgeStore(path.join(root,'projects','claims'));
    const b=new KnowledgeStore(path.join(root,'projects','support'));
    await Promise.all([a.load(),b.load()]);
    await a.replace('Jira',[{id:'issue-1',provider:'Jira',title:'Claims policy',text:'Claims underwriting decision routing.'}]);
    await b.replace('Jira',[{id:'issue-2',provider:'Jira',title:'Support process',text:'Customer support handover playbook.'}]);
    const anew=new KnowledgeStore(path.join(root,'projects','claims'));await anew.load();
    const bnew=new KnowledgeStore(path.join(root,'projects','support'));await bnew.load();
    assert.equal(anew.search('underwriting').length,1);
    assert.equal(anew.search('handover').length,0);
    assert.equal(bnew.search('handover').length,1);
    assert.equal(bnew.search('underwriting').length,0);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('extension defaults inherit only when project-specific values are absent',async()=>{
  const extension={atlassian:{baseUrl:'https://common.atlassian.net',email:'user@example.com'},jira:{projectKey:'GLOBAL'},confluence:{spaceKey:'DEFAULT'},github:{}};
  const p=normalizeProjectInput({id:'sample',name:'Sample',settings:{jira:{projectKey:'LOCAL'},confluence:{spaceKey:'TEAM'}}});
  const result=projectConfig(p,extension);
  assert.equal(result.get('atlassian.baseUrl'),'https://common.atlassian.net');
  assert.equal(result.get('jira.jql'),'project = "LOCAL" ORDER BY updated DESC');
  assert.equal(result.get('confluence.spaceKey'),'TEAM');
  assert.equal(result.get('github.repo'),'');
  const fallback=projectConfig(normalizeProjectInput({name:'Other'}),extension);
  assert.equal(fallback.get('jira.jql'),'project = "GLOBAL" ORDER BY updated DESC');
  assert.equal(fallback.get('confluence.spaceKey'),'DEFAULT');
  assert.deepEqual(parseRepoUrl('https://github.com/a/b'),{owner:'a',repo:'b'});
  assert.throws(()=>parseRepoUrl('https://notgithub.com/a/b'));
});

test('reset removes only workspace/projects contents, not surrounding workspace files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-reset-'));
  try{
    const r=new ProjectRegistry(root);
    await r.create({name:'Local'});
    await fs.writeFile(path.join(r.root,'other.txt'),'also inside projects');
    await fs.writeFile(path.join(root,'important.txt'),'must survive');
    await r.resetFolder();
    assert.deepEqual(await fs.readdir(r.root),[]);
    assert.equal(await fs.readFile(path.join(root,'important.txt'),'utf8'),'must survive');
    assert.throws(()=>r.fileFor('../escape'));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('reset refuses symlinked projects folders',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-reset-link-'));
  try{
    const elsewhere=path.join(root,'elsewhere');await fs.mkdir(elsewhere);
    await fs.writeFile(path.join(elsewhere,'keep.txt'),'safe');
    await fs.symlink(elsewhere,path.join(root,'projects'));
    await assert.rejects(()=>new ProjectRegistry(root).resetFolder(),/not a regular folder/);
    assert.equal(await fs.readFile(path.join(elsewhere,'keep.txt'),'utf8'),'safe');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('extension Jira defaults, discovered Confluence metadata, and GitHub credentials stay isolated',()=>{
  const defaults=normalizeExtensionSettings({jiraBaseUrl:'https://aia.atlassian.net',jiraEmail:'aia@example.com',githubOwner:'aia',githubRepository:'docs'});
  const custom=normalizeProjectInput({name:'Finance Docs',settings:{confluence:{spaceId:'128',spaceKey:'FIN',spaceName:'Finance Knowledge',baseUrl:'https://aia.atlassian.net/wiki'},jira:{projectKey:'FIN'},github:{owner:'team',repo:'specific-docs'},jiraToken:'must-not-persist',githubPersonalToken:'must-not-persist'}});
  const config=projectConfig(custom,defaults);
  assert.equal(config.get('jira.baseUrl'),'https://aia.atlassian.net');
  assert.equal(config.get('jira.email'),'aia@example.com');
  assert.equal(config.get('confluence.spaceId'),'128');
  assert.equal(config.get('confluence.spaceName'),'Finance Knowledge');
  assert.equal(config.get('confluence.baseUrl'),'https://aia.atlassian.net/wiki');
  assert.equal(config.get('github.owner'),'team');
  assert.equal(config.get('github.repo'),'specific-docs');
  assert.doesNotMatch(JSON.stringify(custom),/must-not-persist/);
  assert.doesNotMatch(JSON.stringify(defaults),/Token/);
  assert.throws(()=>normalizeExtensionSettings({jira:{baseUrl:'https://aia.atlassian.net'},confluence:{baseUrl:'https://evil.com/wiki'}}),/same Atlassian site/);
  assert.throws(()=>normalizeProjectInput({name:'Other',settings:{confluence:{spaceId:'abc'}}}),/digits only/);
});

test('legacy 0.00.02 Atlassian settings automatically normalize to jiraBaseUrl and jiraEmail',()=>{
  const next=normalizeExtensionSettings({atlassian:{baseUrl:'https://old.atlassian.net',email:'user@example.com'},confluence:{spaceKey:'DOC'}});
  assert.deepEqual(next.jira,{baseUrl:'https://old.atlassian.net',email:'user@example.com'});
  assert.equal(projectConfig(null,next).get('confluence.baseUrl'),'https://old.atlassian.net/wiki');
  assert.equal(projectConfig({settings:{atlassian:{baseUrl:'https://override.atlassian.net',email:'override@example.com'}}},next).get('jira.baseUrl'),'https://override.atlassian.net');
});

test('GitHub URL, owner/repo shorthand and repo name normalize without losing the owner',()=>{
  const link='https://github.com/n6ffp2r5m5-prog/app-test';
  const settings=normalizeExtensionSettings({github:{owner:'n6ffp2r5m5-prog',repo:link}});
  assert.equal(settings.github.owner,'n6ffp2r5m5-prog');assert.equal(settings.github.repo,'app-test');assert.equal(settings.github.branch||'','');
  assert.deepEqual(normalizeGithubRepository('',link),{owner:'n6ffp2r5m5-prog',repo:'app-test'});
  assert.deepEqual(normalizeGithubRepository('','aia-dev/knowledge.git'),{owner:'aia-dev',repo:'knowledge'});
  assert.deepEqual(normalizeGithubRepository('aia-dev','knowledge'),{owner:'aia-dev',repo:'knowledge'});
  assert.deepEqual(normalizeGithubRepository('',''),{owner:'',repo:''});
  assert.throws(()=>normalizeGithubRepository('different-org',link),/owner does not match/);
  assert.throws(()=>normalizeGithubRepository('','https://other-site.example/org/repo'),/github.com/);
  assert.throws(()=>normalizeGithubRepository('','https://github.com/org/repo/issues'),/full GitHub repository URL/);
  assert.throws(()=>normalizeGithubRepository('','https://github.com/org/repo?token=bad'),/query strings/);
  assert.throws(()=>normalizeGithubRepository('','repo name with spaces'),/invalid/);
});
