'use strict';
// Bounded ZIP importer for temporary SDLC Library data. No ZIP scripts are executed.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const MAX_ZIP=80*1024*1024,MAX_TOTAL=24*1024*1024,MAX_FILE=1024*1024,MAX_ENTRIES=3000,MAX_ASSETS=600;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const base=workspace=>path.join(workspace,'.atgv','offline-sdlc-library');
const allowed=p=>['catalog.json','catalog.yaml','VERSION','README.md'].includes(p)||/^(roles|shared|tech-stacks|ai-harness|docs)\//.test(p);
function safeName(p){
 if(!p||p.length>450||p.startsWith('/')||p.includes('\\')||p.includes('\0')||p.includes('\ufffd')||
    p.split('/').some(x=>!x||x==='.'||x==='..'||x.includes(':')||/[\x00-\x1f]/.test(x)))
  throw Error('Unsafe path inside SDLC Library ZIP: '+String(p).slice(0,120));
 return p;
}
const CRC=Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function crc32(b){let n=0xffffffff;for(const x of b)n=CRC[(n^x)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
function readArchive(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>MAX_ZIP)throw Error('Library ZIP is empty or exceeds 80 MiB.');
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 }
 if(end<0)throw Error('Invalid ZIP end-of-directory.');
 const count=bytes.readUInt16LE(end+10),length=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
 if(count===0||count>MAX_ENTRIES||count!==bytes.readUInt16LE(end+8)||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||
    offset===0xffffffff||length===0xffffffff||offset+length>end)
  throw Error('Invalid, multi-disk or unsupported ZIP64 archive.');
 let at=offset;const entries=[],names=new Set();
 for(let i=0;i<count;i++){
  if(at+46>offset+length||bytes.readUInt32LE(at)!==0x02014b50)throw Error('Invalid ZIP central directory.');
  const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),crc=bytes.readUInt32LE(at+16);
  const packed=bytes.readUInt32LE(at+20),unpacked=bytes.readUInt32LE(at+24),n=bytes.readUInt16LE(at+28);
  const extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),type=(bytes.readUInt32LE(at+38)>>>16)&0o170000;
  const local=bytes.readUInt32LE(at+42);
  if(!n||at+46+n+extra+comment>offset+length)throw Error('Invalid ZIP entry length.');
  const full=bytes.subarray(at+46,at+46+n).toString('utf8');at+=46+n+extra+comment;
  const isDir=full.endsWith('/');safeName(isDir?full.slice(0,-1):full);
  if(names.has(full))throw Error('Duplicate ZIP entry.');names.add(full);
  if(type&&type!==(isDir?0o040000:0o100000))throw Error('ZIP contains symlink or special file: '+full);
  if(flags&1||flags&64||flags&0x2000||![0,8].includes(method)||packed===0xffffffff||unpacked===0xffffffff)
   throw Error('Encrypted or unsupported ZIP entry: '+full);
  if(isDir)continue;
  if(unpacked>MAX_FILE)throw Error('Oversized SDLC Library ZIP file: '+full);
  if(local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)throw Error('Invalid ZIP local header: '+full);
  const localNameLen=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),start=local+30+localNameLen+localExtra;
  if(bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method||
     bytes.subarray(local+30,local+30+localNameLen).toString('utf8')!==full||start+packed>offset)
   throw Error('ZIP local entry mismatch: '+full);
  entries.push({full,start,packed,unpacked,method,crc});
 }
 if(at!==offset+length)throw Error('Incorrect ZIP index size.');
 const roots=entries.filter(e=>e.full==='catalog.json'||/^[^/]+\/catalog\.json$/.test(e.full));
 if(roots.length!==1)throw Error('ZIP must contain exactly one root catalog.json. GitHub source ZIP folders are supported.');
 const prefix=roots[0].full.slice(0,-'catalog.json'.length);
 const files=new Map();let total=0;
 for(const e of entries){
  if(!e.full.startsWith(prefix))continue;
  const relative=e.full.slice(prefix.length);if(!allowed(relative))continue;
  safeName(relative);
  if(files.has(relative)||files.size>=MAX_ASSETS)throw Error('Duplicate or too many catalog assets.');
  total+=e.unpacked;if(total>MAX_TOTAL)throw Error('Uncompressed SDLC Library exceeds 24 MiB.');
  const packed=bytes.subarray(e.start,e.start+e.packed);
  let raw;
  try{raw=e.method===0?Buffer.from(packed):zlib.inflateRawSync(packed,{maxOutputLength:MAX_FILE+1});}
  catch{throw Error('Invalid compressed ZIP asset: '+relative);}
  if(raw.length!==e.unpacked||crc32(raw)!==e.crc)throw Error('ZIP checksum mismatch: '+relative);
  files.set(relative,raw);
 }
 const catalog=require('./github-sdlc-catalog');
 const manifest=files.get('catalog.json');if(!manifest)throw Error('SDLC Library ZIP must contain catalog.json.');
 const info=catalog.inspectManifest(manifest,new Set(files.keys()),'json');
 return {files,info};
}
async function imported(workspace,repositoryUrl){
 if(!workspace)return null;
 let state;
 try{state=JSON.parse(await fs.readFile(path.join(base(workspace),'state.json'),'utf8'));}
 catch(e){if(e.code==='ENOENT')return null;throw Error('Offline library metadata is damaged; existing data was retained.');}
 const catalog=require('./github-sdlc-catalog'),p=catalog.parseRepository(repositoryUrl||'');
 if(!p||state.repository.toLowerCase()!==(p.owner+'/'+p.repo).toLowerCase())return null;
 if(state.schema!==1||state.source!=='zip'||!/^[a-f0-9]{64}$/.test(state.archiveHash)||
   !state.assets||Object.keys(state.assets).length>MAX_ASSETS)throw Error('Offline library metadata is invalid.');
 const root=path.join(base(workspace),'files'),stat=await fs.lstat(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Offline library files are not a safe directory.');
 const seen=new Set();
 async function walk(dir,prefix=''){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   const rel=prefix+entry.name;safeName(rel);const full=path.join(dir,entry.name);
   if(entry.isSymbolicLink()||(!entry.isFile()&&!entry.isDirectory()))throw Error('Offline catalog has an unsafe file: '+rel);
   if(entry.isDirectory()){await walk(full,rel+'/');continue;}
   if(!Object.hasOwn(state.assets,rel)||hash(await fs.readFile(full))!==state.assets[rel])
    throw Error('Offline library was modified: '+rel+'. Keeping all original files.');
   seen.add(rel);
  }
 }
 await walk(root);
 if(seen.size!==Object.keys(state.assets).length)throw Error('Offline library is missing files. Existing data is retained.');
 return {...state,root,checkout:root,version:state.version,roles:state.roles,techStacks:state.techStacks,
  roleCount:state.roles.length,stackCount:state.techStacks.length,sha:'',ref:'offline',offline:true};
}
async function importZip({file,workspace,repositoryUrl}){
 const catalog=require('./github-sdlc-catalog'),p=catalog.parseRepository(repositoryUrl||'');
 if(!p)throw Error('Enter the SDLC Library GitHub repository URL before importing ZIP.');
 if(!workspace)throw Error('Open a VS Code folder before importing an SDLC Library ZIP.');
 if(path.extname(file).toLowerCase()!=='.zip')throw Error('Choose a .zip SDLC Library archive.');
 const stat=await fs.lstat(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_ZIP)throw Error('Invalid or oversized SDLC Library ZIP.');
 if(await imported(workspace,repositoryUrl))throw Error('A verified offline Library ZIP is already installed. It will be removed automatically after GitHub recovery.');
 const data=await fs.readFile(file),archive=readArchive(data),parent=path.join(workspace,'.atgv');
 const dirStat=await fs.lstat(parent).catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(dirStat&&(!dirStat.isDirectory()||dirStat.isSymbolicLink()))throw Error('Unsafe ATGV workspace directory.');
 await fs.mkdir(parent,{recursive:true});
 const staging=path.join(parent,'.offline-sdlc-'+crypto.randomUUID()),target=base(workspace);
 try{
  await fs.mkdir(path.join(staging,'files'),{recursive:true});const assets={};
  for(const [relative,contents] of archive.files){
   const destination=path.join(staging,'files',...relative.split('/'));
   await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,contents,{flag:'wx',mode:0o600});
   assets[relative]=hash(contents);
  }
  const state={schema:1,source:'zip',repository:p.owner+'/'+p.repo,archiveHash:hash(data),filename:path.basename(file),
   version:archive.info.version,roles:archive.info.roles,techStacks:archive.info.techStacks,
   workflows:archive.info.workflows,templates:archive.info.templates,assets,installedAt:new Date().toISOString()};
  await fs.writeFile(path.join(staging,'state.json'),JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});
  await fs.rename(staging,target);return {...state,root:path.join(target,'files'),roleCount:state.roles.length,stackCount:state.techStacks.length};
 }finally{await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});}
}
async function removeAfterVerifiedGit(workspace,repositoryUrl){
 const existing=await imported(workspace,repositoryUrl);
 if(!existing)return false;
 const catalog=require('./github-sdlc-catalog');
 const live=await catalog.gitInstalled(workspace,{repositoryUrl});
 if(!live?.checkout||!/^[a-f0-9]{40}$/.test(live.sha))return false;
 const root=base(workspace),names=(await fs.readdir(root)).sort();
 if(names.join(',')!=='files,state.json')throw Error('Offline Library contains unexpected files; preserved for manual review.');
 await fs.rm(root,{recursive:true,force:false});return true;
}
module.exports={readArchive,importZip,imported,removeAfterVerifiedGit,location:base};
