'use strict';
// A build identity is embedded in the installed package.json, not a mutable
// release tag, receipt, local filesystem timestamp or displayed version.
const {inflateRawSync}=require('node:zlib');
const HEX=/^[a-f0-9]{64}$/;
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)?Date.parse(value):NaN;
function identity(manifest,version){
 const b=manifest?.atgvBuild;
 if(manifest?.name!=='atgv-aiatech-assist'||manifest?.publisher!=='aia-my'||manifest?.version!==version||
    b?.schema!==1||!HEX.test(String(b.contentSha256||''))||!Number.isFinite(date(b.builtAt)))return null;
 return {schema:1,contentSha256:b.contentSha256,builtAt:b.builtAt};
}
function newerBuild(installed,candidate){
 return !!installed&&!!candidate&&candidate.contentSha256!==installed.contentSha256&&date(candidate.builtAt)>date(installed.builtAt);
}
// Read exactly one bounded ZIP central-directory member; never extract paths,
// run code or trust arbitrary compression sizes. Python packager uses normal
// non-ZIP64 stored/deflated entries; reject unsupported/malformed archives.
function readManifest(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.length>80*1024*1024)throw Error('Invalid VSIX archive.');
 let e=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){e=i;break;}
 }
 if(e<0||bytes.readUInt16LE(e+4)||bytes.readUInt16LE(e+6))throw Error('Unsupported VSIX ZIP directory.');
 const count=bytes.readUInt16LE(e+10),size=bytes.readUInt32LE(e+12),start=bytes.readUInt32LE(e+16);
 if(!count||count>20000||bytes.readUInt16LE(e+8)!==count||start+size!==e)throw Error('Invalid VSIX ZIP directory.');
 let pos=start,member=null;
 for(let n=0;n<count;n++){
  if(pos+46>e||bytes.readUInt32LE(pos)!==0x02014b50)throw Error('Invalid VSIX ZIP entry.');
  const len=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32),next=pos+46+len+extra+comment;
  if(next>e)throw Error('Invalid VSIX ZIP entry bounds.');
  const name=bytes.toString('utf8',pos+46,pos+46+len);
  if(name==='extension/package.json'){
   if(member)throw Error('Duplicate VSIX package manifest.');
   const flag=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),compressed=bytes.readUInt32LE(pos+20),plain=bytes.readUInt32LE(pos+24),local=bytes.readUInt32LE(pos+42);
   if(flag&1||![0,8].includes(method)||!plain||plain>1024*1024||compressed>1024*1024||local+30>start||bytes.readUInt32LE(local)!==0x04034b50||bytes.readUInt16LE(local+8)!==method)throw Error('Unsafe VSIX manifest entry.');
   const localFlag=bytes.readUInt16LE(local+6);
   if(localFlag!==flag||(!(flag&8)&&(bytes.readUInt32LE(local+18)!==compressed||bytes.readUInt32LE(local+22)!==plain)))throw Error('Inconsistent VSIX manifest headers.');
   const localLen=bytes.readUInt16LE(local+26),offset=local+30+localLen+bytes.readUInt16LE(local+28);
   if(offset+compressed>start||bytes.toString('utf8',local+30,local+30+localLen)!==name)throw Error('Invalid VSIX manifest location.');
   const raw=bytes.subarray(offset,offset+compressed),out=method===0?raw:inflateRawSync(raw,{maxOutputLength:1024*1024});
   if(out.length!==plain)throw Error('Invalid VSIX manifest size.');
   member=JSON.parse(out.toString('utf8'));
  }
  pos=next;
 }
 if(pos!==e||!member)throw Error('VSIX package manifest unavailable.');
 return member;
}
module.exports={identity,newerBuild,readManifest};
