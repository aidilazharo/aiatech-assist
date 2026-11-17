'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const readiness=require('../src/lib/startup-readiness');
const catalog=require('../src/github-sdlc-catalog');
const stacks=require('../src/tech-stacks');
const inventory=require('../src/startup-catalog-inventory');
const fixture=require('./catalog-fixture');
const runner=async command=>({stdout:command==='node'?'v22.22.3':command==='dotnet'?'10.0.1':command==='java'?'25.0.1':'9.0.0'});

test('startup reads the real activated catalog and includes local React project modules',async t=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-start-modules-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
 await fixture.activate(workspace);
 const loaded=await stacks.listStacks(workspace);
 const result=await readiness.check({runner,loadCatalog:async()=>({source:'Active SDLC Library',version:'1.1.0',stacks:loaded})});
 const react=result.stacks.find(row=>row.id==='react');
 assert.equal(result.catalog.available,true);assert.equal(result.stacks.length,5);
 assert.ok(react.dependencyPackages.some(p=>p.name==='vite'&&p.manager==='npm'&&p.scope==='development'));
 assert.ok(react.dependencyPackages.some(p=>p.name==='react'&&p.scope==='runtime'));
 assert.equal(react.ready,true,'project packages are not falsely treated as globally installed');
});

test('dependency discovery covers nested manifests, optional and peer packages, and more than 80 entries',()=>{
 const many=Object.fromEntries(Array.from({length:105},(_,i)=>['pkg-'+i,'^1.0.0']));
 const files={
  'package.json':Buffer.from(JSON.stringify({dependencies:many,devDependencies:{vite:'^7'},optionalDependencies:{fsevents:'^2'},peerDependencies:{react:'^19'},engines:{node:'^22.22.3 || >=24'}})),
  'apps/custom/package.json':Buffer.from(JSON.stringify({dependencies:{'@example/api':'~2'}})),
  'node_modules/ignored/package.json':Buffer.from(JSON.stringify({dependencies:{'must-not-appear':'1'}})),
  'tests/Api.Tests.csproj':Buffer.from('<Project><PackageReference Include="xunit"><Version>2.9.2</Version></PackageReference></Project>'),
  'service/pom.xml':Buffer.from('<project><dependencies><dependency><groupId>org.sample</groupId><artifactId>client</artifactId><scope>test</scope></dependency></dependencies><build><plugins><plugin><groupId>org.sample</groupId><artifactId>builder</artifactId></plugin></plugins></build></project>')
 };
 const list=stacks.catalogDependencyPackages(files);
 assert.equal(list.filter(p=>p.name.startsWith('pkg-')).length,105);
 for(const name of ['vite','fsevents','react','@example/api','xunit','org.sample:client','org.sample:builder'])assert.ok(list.some(p=>p.name===name),name);
 assert.equal(list.find(p=>p.name==='xunit').scope,'test');
 assert.equal(list.find(p=>p.name==='xunit').version,'2.9.2');
 assert.equal(list.find(p=>p.name==='org.sample:builder').scope,'build');
 assert.ok(!list.some(p=>p.name==='must-not-appear'));
 assert.deepEqual(stacks.catalogNodeEngines(files),[{source:'package.json',range:'^22.22.3 || >=24'}]);
 assert.throws(()=>stacks.catalogDependencyPackages({'package.json':Buffer.from('{invalid')}),/Invalid npm package manifest/);
});

test('unavailable libraries are reported without claiming project packages are installed',async()=>{
 const progress=[];
 const result=await readiness.check({runner,loadCatalog:async()=>{throw Error('No saved GitHub connection');},onProgress:event=>progress.push(event)});
 assert.equal(result.catalog.available,false);assert.ok(result.stacks.every(s=>s.catalogStatus==='unavailable'));
 assert.ok(result.stacks.every(s=>s.dependencyPackages.length===0));
 assert.equal(progress.at(-1).completed,progress.at(-1).total);assert.equal(progress.at(-1).percent,100);
});

test('new catalog stacks are shown without pretending their host prerequisites were checked',()=>{
 const value=readiness.attachCatalog([readiness.assessStack(readiness.STACKS[0],{})],{available:true,stacks:[{id:'new-stack',name:'New stack',dependencyPackages:[{name:'tool',manager:'npm'}]}]});
 assert.equal(value.find(s=>s.id==='react').catalogStatus,'not-listed');
 const added=value.find(s=>s.id==='new-stack');assert.equal(added.hostRequirementsUnknown,true);assert.equal(added.ready,false);assert.equal(added.dependencyPackages[0].name,'tool');
});

test('first-run GitHub inventory reads only verified manifest blobs from one commit',async()=>{
 const descriptor=await fs.readFile(path.join(__dirname,'fixtures/catalog/tech-stacks/react/stack.json'));
 const sources={
  'catalog.json':Buffer.from(JSON.stringify({schema:1,version:'1.1.15',roles:['business-analyst'],techStacks:['react']})),
  'VERSION':Buffer.from('1.1.15\n'),
  'roles/business-analyst/SKILL.md':Buffer.from('# BA'),
  'tech-stacks/react/stack.json':descriptor,
  'tech-stacks/react/scaffold/package.json':Buffer.from(JSON.stringify({dependencies:{react:'^19'},devDependencies:{vite:'^7'},engines:{node:'>=22'}})),
  'tech-stacks/react/scaffold/unsafe.js':Buffer.from('do not run')
 };
 const files=Object.entries(sources).map(([file,data])=>({path:file,sha:catalog.blobSha(data),size:data.length}));
 const bySha=new Map(files.map(item=>[item.sha,sources[item.path]]));
 const api={...catalog,getTree:async()=>({route:'https://api.github.com/repos/example/catalog',sha:'a'.repeat(40),files})};
 const requested=[];
 const request=async(url)=>{const sha=url.split('/').at(-1);requested.push(sha);return {encoding:'base64',content:bySha.get(sha).toString('base64')};};
 const result=await inventory.remote({config:{},token:'test',api,request});
 assert.equal(result.version,'1.1.15');assert.ok(result.stacks[0].dependencyPackages.some(x=>x.name==='vite'));
 assert.deepEqual(result.stacks[0].nodeEngines,[{source:'package.json',range:'>=22'}]);
 assert.ok(!requested.includes(catalog.blobSha(sources['tech-stacks/react/scaffold/unsafe.js'])));
 await assert.rejects(inventory.remote({config:{},api,request:async()=>({encoding:'base64',content:Buffer.from('tampered').toString('base64')})}),/integrity check failed/);
});

test('startup UI lists catalog modules separately from computer tools',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../media/start.js'),'utf8');
 const from=source.indexOf('function renderStartupStackReadiness('),to=source.indexOf('function invalidateStartupConnection(',from);
 assert.ok(from>=0&&to>from);
 function node(tag){const classes=new Set();return {tag,children:[],dataset:{},style:{},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},append(...v){this.children.push(...v);},replaceChildren(){this.children=[];},setAttribute(){},addEventListener(){},querySelectorAll(){return [];}};}
 const nodes={startupStackGrid:node('div'),startupToolMessage:node('p')};
 const render=new Function('document','$','startupScanComplete','startupScanPercent','startupLastInstalledTool','startupInstallingModule','renderStartupPage','send',source.slice(from,to)+';return renderStartupStackReadiness;')({createElement:node},id=>nodes[id],false,()=>{},'',null,()=>{},()=>{});
 render({catalog:{available:true,source:'Active SDLC Library',version:'1.1.15'},stacks:[{id:'react',name:'React',ready:true,catalogStatus:'available',components:[{id:'node',required:true,installed:true,compatible:true,version:'v22'}],nodeEngines:[{range:'>=22',source:'package.json'}],dependencyPackages:[{name:'vite',version:'^7',manager:'npm',scope:'development',source:'package.json'},{name:'react',version:'^19',manager:'npm',scope:'runtime',source:'package.json'}]}]});
 const all=root=>[root,...root.children.flatMap(all)],items=all(nodes.startupStackGrid),text=items.map(item=>item.textContent||'').join(' ');
 assert.match(text,/Project modules · 2/);assert.match(text,/vite/);assert.match(text,/react/);assert.match(text,/Node.js requirement: >=22/);assert.match(text,/installed or restored in the project/);
 assert.equal(items.filter(item=>item.tag==='button').length,0,'project dependencies are not presented as global installers');
});
