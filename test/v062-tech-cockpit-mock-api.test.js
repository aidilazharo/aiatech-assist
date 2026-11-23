'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const mock=require('../src/tech-cockpit-mock-api');
const overlay=require('../src/stack-mock-preview');
const stack=require('../src/architect-custom-stack');

const ask=(api,method,pathname,qs='',body)=>api({method,pathname,query:new URLSearchParams(qs),body});

test('TechCockpit mock serves a contract-shaped fictional session and five paged applications',()=>{
 const api=mock.createTechCockpitMockApi();
 const me=ask(api,'GET','/api/v1/me');
 assert.equal(me.status,200);
 assert.equal(me.body.authMethod,'session');
 assert.match(me.body.user.email,/@preview\.invalid$/);
 assert.equal(me.body.permissions.includes('trm:application:read'),true);
 const page=ask(api,'GET','/api/v1/trm/applications','page=2&pageSize=2');
 assert.equal(page.status,200);assert.equal(page.body.total,5);assert.equal(page.body.items.length,2);
 assert.equal(page.body.page,2);
 for(const a of page.body.items)assert.match(a.id,/^[0-9a-f-]{36}$/i);
 const filtered=ask(api,'GET','/api/v1/trm/applications','q=payment');
 assert.equal(filtered.body.total,1);assert.match(filtered.body.items[0].name,/Payment/);
});

test('TechCockpit API matches TRM list/detail/facets and portfolio contracts',()=>{
 const api=mock.createTechCockpitMockApi();
 for(const r of ['services','capabilities','software-models','product-standards','servers']){
  const result=ask(api,'GET','/api/v1/trm/'+r);
  assert.equal(result.status,200,r);assert.ok(Array.isArray(result.body.items));assert.ok(result.body.items.length>0,r);
  const d=ask(api,'GET','/api/v1/trm/'+r+'/'+result.body.items[0].id);
  assert.equal(d.status,200,r);assert.equal(d.body.id,result.body.items[0].id);
 }
 assert.equal(ask(api,'GET','/api/v1/trm/facets').body.businessUnits.length>0,true);
 assert.ok(Array.isArray(ask(api,'GET','/api/v1/portfolios').body.items));
 assert.ok(Array.isArray(ask(api,'GET','/api/v1/trm/landscape').body.applications));
 assert.ok(Array.isArray(ask(api,'GET','/api/v1/trm/technology').body.standards));
 assert.equal(ask(api,'GET','/api/v1/trm/initiatives').body.items[0].status,'proposed');
});

test('TechCockpit synthetic writes remain in memory; unknown routes fail closed',()=>{
 const api=mock.createTechCockpitMockApi();
 const item=ask(api,'GET','/api/v1/trm/applications').body.items[0];
 assert.equal(ask(api,'PATCH','/api/v1/trm/applications/'+item.id,'',{timeRating:'migrate'}).status,200);
 assert.equal(ask(api,'GET','/api/v1/trm/applications').body.items[0].timeRating,'migrate');
 assert.equal(ask(api,'GET','/api/v1/trm/applications/invalid').status,404);
 assert.equal(ask(api,'GET','/api/v1/users/confidential').status,501);
 assert.equal(ask(api,'GET','/api/v1/health').body.database,'simulated');
 assert.equal(ask(api,'GET','/api/v1/auth/saml/login','returnTo=https%3A%2F%2Fevil.example').headers.location,'/');
 assert.equal(ask(api,'POST','/api/v1/me/notifications/read-all').body.updated,1);
 assert.equal(ask(api,'GET','/api/v1/me/notifications/unread-count').body.unread,0);
});

test('Vite overlay contains self-contained TechCockpit mock without external backend proxy',()=>{
 const text=overlay.render({source:'vite.config.ts',port:5173,mockDatabase:true,profile:'tech-cockpit'});
 assert.match(text,/Customer Relationship Hub/);
 assert.match(text,/const techCockpitApi/);
 assert.match(text,/proxy: \{\}/);
 assert.match(text,/x-atgv-mock-preview/);
 assert.match(text,/Mock endpoint not implemented/);
 assert.doesNotMatch(text,/__ATGV_PROFILE_INIT__/);
 assert.throws(()=>overlay.render({source:'vite.config.ts',port:5173,profile:'arbitrary'}),/Unsupported/);
 const legacy=overlay.render({source:'vite.config.ts',port:5173,mockDatabase:true});
 assert.match(legacy,/Example CRM \(MOCK\)/);
 assert.doesNotMatch(legacy,/Customer Relationship Hub/);
});

test('Generated Vite middleware serves mock API over HTTP without a backend listener',async()=>{
 const generated=overlay.render({source:'vite.config.ts',port:5173,mockDatabase:true,profile:'tech-cockpit'});
 const runnable=generated.replace(/^import sourceConfig.*\n/m,'').replace(/^import \{ mergeConfig \} from 'vite';\n/m,'')
  .replace('export default async function atgvMockConfig','async function atgvMockConfig');
 const sandbox={URL,URLSearchParams,Buffer,setTimeout};
 const atgvMockConfig=vm.runInNewContext(`const sourceConfig={};const mergeConfig=(a,b)=>b;${runnable}\natgvMockConfig`,sandbox);
 const cfg=await atgvMockConfig({});
 let middleware=null;
 cfg.plugins[0].configureServer({middlewares:{use(fn){middleware=fn;}}});
 assert.equal(typeof middleware,'function');
 const server=http.createServer((req,res)=>middleware(req,res,()=>{res.statusCode=599;res.end('not mocked');}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const resp=await fetch(url+'/api/v1/trm/applications');
  assert.equal(resp.status,200);assert.equal(resp.headers.get('x-atgv-mock-preview'),'true');
  assert.equal((await resp.json()).total,5);
  const blocked=await fetch(url+'/api/v1/sensitive-operation');
  assert.equal(blocked.status,501);
  const site=await fetch(url+'/');assert.equal(site.status,599);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('TechCockpit monorepo scanner selects real Vite frontend and NestJS backend',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-v062-'));
 try{
  execFileSync('git',['init','-q'],{cwd:root});
  const front=path.join(root,'ReactTS_Frontend'),back=path.join(root,'NestJS_Backend');
  fs.mkdirSync(front);fs.mkdirSync(back);
  fs.writeFileSync(path.join(front,'package.json'),JSON.stringify({name:'reactts-frontend',scripts:{dev:'vite'},dependencies:{react:'^19'},devDependencies:{vite:'^8'}}));
  fs.writeFileSync(path.join(front,'vite.config.ts'),"export default {server:{proxy:{'/api':'http://localhost:3000'}}};");
  fs.writeFileSync(path.join(back,'package.json'),JSON.stringify({name:'NestJS_Backend',scripts:{'start:dev':'nest start --watch'},dependencies:{'@nestjs/core':'^12'},devDependencies:{vite:'8'}}));
  const s=await stack.scan(root);
  assert.equal(s.targets.some(x=>x.relative==='ReactTS_Frontend'&&x.runnable&&x.mockable),true);
  assert.equal(s.targets.some(x=>x.relative==='NestJS_Backend'&&x.runnable&&!x.mockable),true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
