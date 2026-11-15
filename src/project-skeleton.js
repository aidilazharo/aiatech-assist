'use strict';
// Never embed technology source files. Scaffolds are loaded exclusively from a
// verified, activated snapshot of the configured GitHub main-branch catalog.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const catalog=require('./github-sdlc-catalog');
const {loadStack}=require('./tech-stacks');
async function workspaceFor(root){
    let cursor=path.resolve(root);
    for(let i=0;i<12;i++){
        const stable=path.join(cursor,'.atgv','sdlc-catalog-state.json');
        const file=path.join(cursor,'.atgv','catalog-assets','active.json');
        if(await fs.stat(stable).then(s=>s.isFile(),()=>false) || await fs.stat(file).then(s=>s.isFile(),()=>false))return cursor;
        const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
    }
    throw Error('No activated GitHub SDLC Catalog found for this repository. Open the ATGV workspace and use Check Updates → Pull Catalog before Save Stack.');
}
async function stackSelection(ids,workspace){
    const manifest=await catalog.activeManifest(workspace);
    if(!Array.isArray(ids)||ids.length<1||ids.length>2||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!manifest.techStacks.includes(id)))throw Error('Choose a supported stack from the active GitHub catalog.');
    const descriptors=await Promise.all(ids.map(id=>loadStack(id,workspace)));
    if(ids.length===2 && !(descriptors.some(s=>s.stackType==='frontend')&&descriptors.some(s=>s.stackType==='backend')))throw Error('Choose one frontend and one backend technology.');
    return {manifest, descriptors};
}
// Compatibility repair for the catalog's known SQLite starter test cleanup.
// Do not change other tests, files, or application logic. This only applies to
// freshly generated starter files and remains covered by templateDigest.
function repairSQLiteStarterTest(relative, contents) {
    if (!/(^|\/)server\/api\.test\.mjs$/.test(relative)) return contents;
    const source = contents.toString('utf8');
    const legacy = 'client.close();await rm(folder,{recursive:true,force:true});';
    if (!source.includes(legacy) || !source.includes("atgv-sqlite-")) return contents;
    return Buffer.from(source.replace(legacy,
        'await client.close();await rm(folder,{recursive:true,force:true,maxRetries:10,retryDelay:200});'));
}
async function skeletonFiles(ids, root){
    const workspace=await workspaceFor(root),{manifest,descriptors}=await stackSelection(ids,workspace);
    const files={};
    for(const id of ids){
        const descriptor=descriptors.find(s=>s.id===id);
        const prefix=ids.length>1?(descriptor.stackType==='frontend'?'apps/web/':'services/api/'):'';
        const tree=await catalog.activeTree(workspace,'tech-stacks/'+id+'/scaffold');
        for(const [name,contents] of Object.entries(tree)){
            const relative=prefix+name;
            if(Object.hasOwn(files,relative))throw Error('Overlapping GitHub catalog starter files: '+relative);
            files[relative]=repairSQLiteStarterTest(relative,contents);
        }
    }
    const active=await catalog.activeRoot(workspace);
    const header={schema:1,stacks:ids,source:'github-main-catalog',catalogVersion:manifest.version,catalogCommit:active.sha,
        fileDigests:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,crypto.createHash('sha256').update(bytes).digest('hex')])),
        // Pin a hash of every downloaded file; prevents drift during retries.
        templateDigest:crypto.createHash('sha256').update(Object.keys(files).sort().map(name=>name+'\0'+crypto.createHash('sha256').update(files[name]).digest('hex')).join('\n')).digest('hex'),
        status:'draft'};
    files['atgv.bootstrap.json']=Buffer.from(JSON.stringify(header,null,2)+'\n');
    return files;
}
async function generateSkeleton(root,ids){
    const real=await fs.realpath(root),st=await fs.lstat(real);
    if(!st.isDirectory()||st.isSymbolicLink())throw Error('Choose a normal Git repository folder.');
    const files=await skeletonFiles(ids,real);
    const preserved=new Set(['README.md','.gitignore','.env.example','.github/workflows/ci.yml']);
    const conflicts=[],existing=[];
    for(const relative of Object.keys(files)){
        const pieces=relative.split('/');let cursor=real;
        for(const part of pieces.slice(0,-1)){
            cursor=path.join(cursor,part);const s=await fs.lstat(cursor).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
            if(s?.isSymbolicLink()||(s&&!s.isDirectory()))throw Error('Unsafe scaffold destination: '+relative);
        }
        const f=path.join(real,relative),s=await fs.lstat(f).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
        if(s){if(!s.isFile()||s.isSymbolicLink())throw Error('Unsafe existing scaffold path: '+relative);
            if(preserved.has(relative))existing.push(relative);else conflicts.push(relative);}
    }
    if(conflicts.length)throw Error('Cannot overwrite existing application files: '+conflicts.slice(0,6).join(', '));
    for(const name of existing)delete files[name];
    const meta=JSON.parse(files['atgv.bootstrap.json']);meta.generatedFiles=Object.keys(files).sort();
    for(const p of existing)delete meta.fileDigests[p];
    files['atgv.bootstrap.json']=Buffer.from(JSON.stringify(meta,null,2)+'\n');
    const written=[];
    try{for(const [name,body] of Object.entries(files)){
        const target=path.join(real,name);await fs.mkdir(path.dirname(target),{recursive:true});
        await fs.writeFile(target,body,{flag:'wx',mode:0o600});written.push(target);
    }}catch(e){for(const file of written)await fs.rm(file,{force:true});throw e;}
    return {root:real,files:Object.keys(files),preserved:existing,stacks:ids,catalogVersion:meta.catalogVersion};
}
module.exports={workspaceFor,stackSelection,skeletonFiles,generateSkeleton};
