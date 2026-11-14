'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const recovery=require('../src/developer-tdd-harness-recovery');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const br='Person Name CRUD: POST /api/people rejects overlength with HTTP 400. UI shows a field error. Saved people persist after restart.';
const ac05=`test('AC-05',async()=>{const user=userEvent.setup();await user.type(input,'A'.repeat(81));await user.click(screen.getByRole('button',{name:'Add name'}));expect(rejectedCreateResponse).toBeDefined();expect(rejectedCreateResponse?.status).toBe(400);});`;
const ac06=`vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => globalThis.fetch(url, opts));`;
const logs=[{passed:false,logs:'AssertionError: expected undefined to be defined\nRangeError: Maximum call stack size exceeded'}];
async function setup(fn){const storage=await fs.mkdtemp(path.join(os.tmpdir(),'atgv319-')),worktree=path.join(storage,'developer-br-worktrees','project','br-012');
 await fs.mkdir(path.join(worktree,'src','__tests__'),{recursive:true});
 const files={'src/ac01.test.tsx':'test(\'normal\',()=>expect(true).toBe(true));','src/__tests__/ac05.test.tsx':ac05,'src/__tests__/ac06.test.tsx':ac06};
 const checkpoint={files:{}};
 for(const [rel,content] of Object.entries(files)){const dest=path.join(worktree,rel);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,content);checkpoint.files[rel]=sha(content);}
 const criteria=[{id:'AC-01',status:'complete',testFiles:['src/ac01.test.tsx']},{id:'AC-05',status:'complete',testFiles:['src/__tests__/ac05.test.tsx']},{id:'AC-06',status:'needs-attention',testFiles:['src/__tests__/ac06.test.tsx']}];
 try{await fn({storage,worktree,files,checkpoint,criteria});}finally{await fs.rm(storage,{force:true,recursive:true});}
}
test('v319 detects previously locked AC-05 and AC-06 test-harness defects using actual failure evidence',()=>setup(async x=>{
 const review=await recovery.plan({...x,failedIndex:2,brText:br,evidence:logs});
 assert.equal(review.status,'ready');assert.equal(review.earliestIndex,1);
 assert.deepEqual(review.items.map(row=>row.kind).sort(),['recursive-fetch-mock','unapproved-ui-network-assertion']);
 const archived=await recovery.archive({...x,storageRoot:x.storage,projectId:'project',brId:'BR-012',review});
 assert.equal(archived.archives.length,2);
 for(const row of archived.archives){assert.equal(await fs.readFile(row.archive,'utf8'),x.files[row.path]);await assert.rejects(fs.access(path.join(x.worktree,row.path)),{code:'ENOENT'});}
 assert.equal(await fs.readFile(path.join(x.worktree,'src/ac01.test.tsx'),'utf8'),x.files['src/ac01.test.tsx']);
}));
test('v319 blocks unverified archived tests and leaves old source untouched',()=>setup(async x=>{
 const bad={...x.checkpoint,files:{...x.checkpoint.files,'src/__tests__/ac05.test.tsx':'0'.repeat(64)}};
 await assert.rejects(recovery.plan({...x,failedIndex:2,brText:br,evidence:logs,checkpoint:bad}),/checkpoint mismatch/);
 assert.equal(await fs.readFile(path.join(x.worktree,'src/__tests__/ac05.test.tsx'),'utf8'),ac05);
 const empty=await recovery.plan({...x,failedIndex:2,brText:br,evidence:[]});assert.equal(empty.status,'not-applicable');
}));
test('v321 independently archives verified earlier AC-05 while preserving unproven AC-06',()=>setup(async x=>{
 await fs.writeFile(path.join(x.worktree,'src/__tests__/ac06.test.tsx'),'const originalFetch=globalThis.fetch;');
 const updated={...x.checkpoint,files:{...x.checkpoint.files,'src/__tests__/ac06.test.tsx':sha('const originalFetch=globalThis.fetch;')}};
 const review=await recovery.plan({...x,checkpoint:updated,failedIndex:2,brText:br,evidence:logs});
 assert.equal(review.status,'ready-earlier-only');
 assert.equal(review.earliestIndex,1);
 assert.equal(review.preservedIndex,2);
 assert.deepEqual(review.items.map(row=>row.criterion),['AC-05']);
 const result=await recovery.archive({...x,storageRoot:x.storage,projectId:'project',brId:'BR-012',review});
 assert.equal(result.archives.length,1);
 assert.equal(await fs.readFile(result.archives[0].archive,'utf8'),ac05);
 assert.equal(await fs.readFile(path.join(x.worktree,'src/__tests__/ac06.test.tsx'),'utf8'),'const originalFetch=globalThis.fetch;');
}));
test('v319 orchestration rewinds to earliest proven faulty RED while preserving accepted implementation files',()=>{
 const host=require('node:fs').readFileSync(path.join(__dirname,'../test/generated/extension-source.txt'),'utf8');
 assert.match(host,/developer-tdd-harness-recovery/);assert.match(host,/failedCriterionIndex=review\.earliestIndex/);
 assert.match(host,/await capture\(\);await save\('red'\)/);
 assert.match(host,/currentRedContractRebaselined=true; \/\/ regenerate only invalid RED/);
});
