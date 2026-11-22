'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const custom=require('../src/architect-custom-stack');

test('standard npm workspaces: Vite frontend wins over NestJS with test-only Vite',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-standard-repo-'));
 try{
  await fs.mkdir(path.join(root,'apps','web'),{recursive:true});
  await fs.mkdir(path.join(root,'apps','api'),{recursive:true});
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({
   name:'workspace',private:true,workspaces:['apps/*'],
   scripts:{dev:'npm --workspace web run dev'}
  }));
  await fs.writeFile(path.join(root,'apps','web','package.json'),JSON.stringify({
   name:'web',scripts:{dev:'vite --host 127.0.0.1'},
   dependencies:{react:'^19'},devDependencies:{vite:'^8'}
  }));
  await fs.writeFile(path.join(root,'apps','web','vite.config.ts'),'export default {};\n');
  await fs.writeFile(path.join(root,'apps','api','package.json'),JSON.stringify({
   name:'api',scripts:{'start:dev':'nest start --watch',test:'vitest run'},
   dependencies:{'@nestjs/core':'^12'},devDependencies:{vite:'^8',vitest:'^4'}
  }));
  const driver={inspectScripts:async()=>({
   repo:{root,sha:'a'.repeat(40),branch:'main',clean:true},
   targets:[
    {relative:'',kind:'npm',scripts:['dev'],installed:false},
    {relative:'apps/api',kind:'npm',scripts:['start:dev','test'],installed:false},
    {relative:'apps/web',kind:'npm',scripts:['dev'],installed:false}
   ]
  })};
  const inspected=await custom.scan(root,{driver});
  assert.equal(inspected.targets.length,3);
  assert.equal(inspected.targets[0].relative,'apps/web');
  assert.equal(inspected.targets[0].mockable,true);
  assert.equal(inspected.targets[0].previewUrl,'http://127.0.0.1:5173/');
  const api=inspected.targets.find(x=>x.relative==='apps/api');
  assert.equal(api.framework,'NestJS');
  assert.equal(api.mockable,false);
  assert.equal(api.mockApi,true);
  assert.equal(api.previewUrl,'http://127.0.0.1:3000/api/v1/health');
  assert.equal(inspected.targets.at(-1).role,'workspace');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('bare Vite dependency cannot make a backend mockable without a local config and run script',()=>{
 const backend=custom.framework({kind:'npm'},{
  dependencies:{express:'^5'},devDependencies:{vite:'^8',vitest:'^4'},
  scripts:{start:'node server.js',test:'vitest run'}
 },{viteConfig:false});
 assert.equal(backend.role,'backend');
 assert.equal(backend.mockType,'api');
 const frontend=custom.framework({kind:'npm'},{
  dependencies:{vue:'^3'},devDependencies:{vite:'^8'},
  scripts:{dev:'vite --host'}
 },{viteConfig:true});
 assert.equal(frontend.role,'frontend');
 assert.equal(frontend.mockType,'vite');
});
