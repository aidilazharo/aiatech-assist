'use strict';
// Evidence-first custom app analysis and isolated, explicit local fix branches.
// AI suggestions are advisory only: no model output is executed as shell/code.
const fs=require('node:fs/promises');
const path=require('node:path');
const developer=require('./developer-git');
const {executeGit}=require('./architect-custom-pull');
const PREVIEW_SERVICE = "// ATGV-generated local preview server. MOCK DATA ONLY; never use for production.\nimport http from 'node:http';\nimport { readFile } from 'node:fs/promises';\nimport { fileURLToPath } from 'node:url';\nconst HOST = '127.0.0.1';\nconst PORT = Number(process.env.ATGV_MOCK_PORT || 3000);\nif (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw Error('Invalid local mock port');\nconst demo = JSON.parse(await readFile(new URL('./mock-database.json', import.meta.url), 'utf8'));\nconst me = {\n  user: { id: '00000000-0000-4000-8000-000000000001',\n    username: 'atgv.mock', email: 'mock@preview.invalid', firstName: 'Mock',\n    lastName: 'Preview', isExternal: false },\n  roles: ['mock-preview'], permissions: [], isSystemAdmin: false, authMethod: 'session',\n  session: { accessExpiresAt: new Date(Date.now() + 900000).toISOString(),\n    expiresAt: new Date(Date.now() + 14400000).toISOString() }\n};\nhttp.createServer((req, res) => {\n  const route = new URL(req.url || '/', 'http://127.0.0.1').pathname;\n  const key = (req.method || 'GET') + ' ' + route;\n  res.setHeader('Cache-Control', 'no-store');\n  res.setHeader('X-ATGV-Mock-Data', 'true');\n  res.setHeader('Content-Type', 'application/json');\n  let status=200, data;\n  if(key==='GET /api/v1/me') data=me;\n  else if(key==='POST /api/v1/auth/refresh') data={accessExpiresAt:new Date(Date.now()+900000).toISOString()};\n  else if(key==='POST /api/v1/auth/logout'){status=204;}\n  else if(key==='GET /api/v1/me/notifications/unread-count') data={unread:0};\n  else if(key==='GET /api/v1/me/notifications') data={items:[],page:1,pageSize:20,total:0};\n  else if(key==='GET /api/v1/health') data={status:'mock',database:'simulated',warning:'NOT A REAL HEALTH CHECK'};\n  else if(key==='GET /api/v1/trm/applications') data={items:demo.applications,page:1,pageSize:25,total:demo.applications.length};\n  else {status=501;data={title:'Unimplemented mock endpoint',status:501,detail:'Mock API has no contract-verified fixture for this route. No real service was contacted.'};}\n  res.writeHead(status);res.end(status===204?'':JSON.stringify(data));\n}).listen(PORT,HOST,()=>console.log('ATGV MOCK DATA ONLY listening on http://'+HOST+':'+PORT));\n";
const FIX_DIR='atgv-preview';
const MAX_SIZE=128*1024;
async function safeRead(file) {
 const stat=await fs.lstat(file).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(!stat||!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_SIZE)return '';
 return fs.readFile(file,'utf8');
}
async function analyse(root,inspection,{fsApi=fs}={}){
 const repo=await developer.repository(root),targets=inspection.targets||[];
 if(repo.sha!==inspection.sha)throw Error('Repository changed during Custom Stack scan.');
 const observations=[],actions=[],inventory=[];
 let hasVite=false,hasDb=false,hasBackend=false;
 for(const target of targets){
  const cwd=path.join(repo.root,target.relative),file=await safeRead(path.join(cwd,'package.json'));
  let pkg={};if(file){try{pkg=JSON.parse(file);}catch{observations.push({level:'error',code:'invalid-manifest',target:target.relative,message:'Invalid application package.json.'});}}
  const deps={...pkg.dependencies,...pkg.devDependencies};
  const dependencyNames=Object.keys(deps);
  const scripts=Object.keys(pkg.scripts||{}).filter(x=>/^[a-zA-Z0-9:_-]+$/.test(x)).slice(0,30);
  const isDb=dependencyNames.some(x=>/^(pg|postgres|mysql2|mysql|sqlite3|better-sqlite3|@mikro-orm\/postgresql|prisma|@prisma\/client|typeorm|sequelize|mongoose)$/.test(x));
  const usesAuth=dependencyNames.some(x=>/okta|passport|saml|openid|auth0/i.test(x));
  // Vite in devDependencies can be a Vitest tool in backend applications.
  // Only runnable, configured Vite frontends count as preview services.
  const vite=target.mockable===true;
  hasVite||=vite;hasDb||=isDb;
  hasBackend||=Boolean(deps['@nestjs/core']||deps.express||deps.fastify);
  const exampleNames=[];
  for(const env of ['.env.example','.env.sample','example.env']){
   const raw=await safeRead(path.join(cwd,env));
   if(raw)for(const line of raw.split(/\r?\n/)){
    const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if(m&&!exampleNames.includes(m[1]))exampleNames.push(m[1]);
   }
  }
  const lockfile=await Promise.all(['package-lock.json','pnpm-lock.yaml','yarn.lock'].map(async x=>!!(await safeRead(path.join(cwd,x))))).then(x=>x.some(Boolean));
  // Bounded static configuration evidence for the configured Solution Architect AI.
  // Never inspect actual .env files or credential stores.
  const configEvidence=[];
  for(const name of ['vite.config.ts','vite.config.js','vite.config.mjs','src/main.ts','src/app.factory.ts','src/config/env.ts','src/app.module.ts','server/index.mjs']){
   const raw=await safeRead(path.join(cwd,...name.split('/')));
   if(!raw)continue;
   // Strip string assignments to plausible secrets before submitting any excerpt.
   const sanitized=raw.slice(0,2000)
    .replace(/((?:token|secret|password|client_secret|api_key)\s*[:=]\s*['"`])[^'"\n`]+/gi,'$1[REDACTED]');
   configEvidence.push({file:name,excerpt:sanitized.slice(0,1100)});
  }
  inventory.push({relative:target.relative,framework:target.framework,kind:target.kind,dependencyNames:dependencyNames.slice(0,55),scripts,envKeys:exampleNames.slice(0,50),lockfile,installed:target.installed,
   nodeEngine:String(pkg.engines?.node||'').slice(0,50),configEvidence});
  if(vite&&configEvidence.some(x=>x.file.startsWith('vite.config.')&&/proxy\s*:/.test(x.excerpt)))
   observations.push({level:'warning',code:'api-proxy',target:target.relative,
    message:'Vite development proxy references an external API process. Frontend alone will not satisfy its API calls; use a separate mock service for offline UI preview.'});
  if(target.kind==='npm'&&!target.installed)observations.push({level:'warning',code:'dependencies',target:target.relative,message:'Dependencies are not installed in this checkout.'});
  if(isDb)observations.push({level:'warning',code:'database',target:target.relative,message:'Database adapter detected. A real database and environment configuration may be required.'});
  if(usesAuth||/SAML_|OKTA_|OIDC_/.test(exampleNames.join(' ')))observations.push({level:'warning',code:'authentication',target:target.relative,message:'Authentication integration detected. A mock preview can bypass external identity services for UI review only.'});
  if(exampleNames.length)observations.push({level:'info',code:'environment',target:target.relative,message:'Environment variable names declared: '+exampleNames.slice(0,16).join(', ')+(exampleNames.length>16?'…':'')});
 }
 if(hasVite)actions.push({id:'mock-services',label:'Mock Services',detail:'Run a localhost frontend with isolated mock API and session.'});
 if(hasVite&&hasDb)actions.push({id:'mock-database',label:'Mock Database',detail:'Use synthetic in-memory API fixtures; real backend database is not started.'});
 if(targets.some(t=>t.kind==='npm'&&!t.installed))actions.push({id:'install-dependencies',label:'Install Dependencies',detail:'Install approved native dependencies for the selected application.'});
 actions.push({id:'fix-branch',label:'Create Fix Branch',detail:'Create a separate local Git branch with mock service/database runner and setup guidance; main unchanged.'});
 return {observations:observations.slice(0,35),actions,inventory,services:{frontend:hasVite,backend:hasBackend,database:hasDb,auth:observations.some(x=>x.code==='authentication')},source:'verified repository manifests and environment-variable names',modelReview:null};
}
async function branches(root,{driver=developer,run=executeGit}={}){
 const repo=await driver.repository(root);
 const raw=await run(repo.root,'for-each-ref','--format=%(refname:short)','refs/heads');
 const items=raw.split(/\r?\n/).filter(x=>x&&/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,110}$/.test(x)&&!x.includes('..')&&!x.includes('//')).slice(0,80);
 return {current:repo.branch,items:items.includes(repo.branch)?items:[repo.branch,...items].filter(Boolean)};
}
async function switchBranch(root,{branch,expectedSha,driver=developer,run=executeGit}={}){
 const before=await driver.repository(root);
 if(before.sha!==expectedSha||!before.clean)throw Error('Git revision changed or checkout has local changes. Refusing branch switch.');
 if(driver.localLogs()?.running)throw Error('Stop the ATGV-managed application before switching branches.');
 const refs=await branches(root,{driver,run});
 if(!refs.items.includes(branch))throw Error('Select an existing local branch from the branch list.');
 if(before.branch===branch)return {branch,sha:before.sha,changed:false};
 await run(before.root,'switch','--',branch);
 const after=await driver.repository(root);
 if(!after.clean||after.branch!==branch)throw Error('Branch switch did not pass checkout verification.');
 return {branch,sha:after.sha,changed:true};
}
async function createFixBranch(root,{expectedSha,driver=developer,run=executeGit,report}={}){
 const before=await driver.repository(root);
 if(before.sha!==expectedSha||!/^[a-f0-9]{40}$/i.test(expectedSha))throw Error('Git revision changed. Re-scan before creating fix branch.');
 if(!before.clean)throw Error('Checkout has local changes. Commit or stash them before creating a fix branch.');
 if(!before.branch)throw Error('Detached HEAD cannot be used to create a fix branch.');
 if(driver.localLogs()?.running)throw Error('Stop the running application before creating a fix branch.');
 const folder=path.join(before.root,FIX_DIR);
 if(await fs.lstat(folder).then(()=>true,e=>e.code==='ENOENT'?false:Promise.reject(e)))
  throw Error('An atgv-preview folder already exists. ATGV will not overwrite it.');
 const ref='fix/atgv-custom-stack-'+before.sha.slice(0,10);
 const refs=await branches(root,{driver,run});
 if(refs.items.includes(ref))throw Error('The proposed fix branch already exists; select it in the branch dropdown.');
 await run(before.root,'switch','-c',ref);
 if(report)await report('Created local fix branch '+ref+' without modifying main.');
 await fs.mkdir(folder,{recursive:false});
 const fixtures={synthetic:true,applications:[{id:'80000000-0000-4000-8000-000000000001',number:'APM-MOCK-1',name:'Example CRM (MOCK)',installStatus:'In Production',criticalityRating:'2 - High'}]};
 const readme=[
 '# ATGV Custom Stack local mock preview',
 '',
 '**MOCK DATA — not the real application backend or database.**',
 '',
 'Branch: '+ref,
 'Source revision: '+before.sha,
 '',
 'Use Node.js 24+ to start an isolated API at http://127.0.0.1:3000:',
 '',
 '    node atgv-preview/mock-services.mjs',
 '',
 'In another terminal, install and start the detected Vite frontend from its own folder:',
 '',
 '    npm ci --ignore-scripts',
 '    npm run dev',
 '',
 'The provided mock service answers only a small allowlist of read-only demo endpoints;',
 'other endpoints return HTTP 501. The JSON file is synthetic, not PostgreSQL.',
 'Do not use these files for integration, security, authentication or database tests.',
 'No production credentials, environment files or existing application sources were changed.',
 'Review generated changes before pushing; ATGV leaves this branch local.',
 ''
 ].join('\n');
 try{
  await fs.writeFile(path.join(folder,'README.md'),readme,{flag:'wx'});
  await fs.writeFile(path.join(folder,'mock-services.mjs'),PREVIEW_SERVICE,{flag:'wx'});
  await fs.writeFile(path.join(folder,'mock-database.json'),JSON.stringify(fixtures,null,2)+'\n',{flag:'wx'});
  await run(before.root,'add','--','atgv-preview/README.md','atgv-preview/mock-services.mjs','atgv-preview/mock-database.json');
  await run(before.root,'-c','user.name=ATGV AIATECH Assist','-c','user.email=atgv@preview.invalid','commit','-m','fix(preview): add isolated mock services and synthetic database fixtures');
 }catch(error){throw Error('Fix branch '+ref+' was created but preview scaffolding could not be completed: '+error.message+'. Inspect the new branch; no changes were made to main.');}
 const after=await driver.repository(root);
 if(after.branch!==ref||!after.clean||after.sha===before.sha)throw Error('Fix branch verification failed; review the checkout.');
 return {branch:ref,sha:after.sha,previousBranch:before.branch,message:'Created and committed local preview fix branch '+ref+'. Mock services/database fixtures are isolated; real backend integration remains unverified. No remote push was performed.'};
}
module.exports={analyse,branches,switchBranch,createFixBranch,PREVIEW_SERVICE};
