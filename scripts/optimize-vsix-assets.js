'use strict';
// Build-only minification. Never rewrite tracked source files or load an
// optimizer in the installed extension. Direct dependencies are pinned.
const fs=require('node:fs/promises');
const path=require('node:path');
const offline=require('./offline-vsix-optimizer');
let terser,CleanCSS;
try{terser=require('terser');CleanCSS=require('clean-css');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;terser=null;CleanCSS=null;}
const root=path.resolve(__dirname,'..');
const output=path.resolve(String(process.argv[2]||''));
if(!process.argv[2]||output===root)throw Error('Specify an isolated VSIX staging directory.');
const normalized=p=>p.split(path.sep).join('/');
async function walk(folder,result=[]){
 for(const entry of await fs.readdir(folder,{withFileTypes:true})){
  const full=path.join(folder,entry.name);
  if(entry.isSymbolicLink())throw Error('Symlinks are not allowed in VSIX optimization inputs: '+full);
  if(entry.isDirectory())await walk(full,result);
  else if(entry.isFile()&&/\.(js|css)$/.test(entry.name))result.push(full);
 }
 return result;
}
async function run(){
 await fs.mkdir(output,{recursive:true});
 const candidates=[...(await walk(path.join(root,'src'))),...(await walk(path.join(root,'media')))];
 const summary={schema:1,optimizer:{javascript:terser?'terser 5.31.6, compress=false, mangle=false':'offline Acorn token/AST validation',css:CleanCSS?'clean-css 5.3.3, level=1':'offline conservative whitespace'},files:[]};
 let optimized=0,bytesSaved=0;
 for(const file of candidates.sort()){
  const relative=normalized(path.relative(root,file));
  const input=await fs.readFile(file,'utf8');
  if(!input.trim())continue;
  let result;
  if(!terser||!CleanCSS){
   result=file.endsWith('.js')?offline.javascript(input):offline.css(input);
  }else if(file.endsWith('.js')){
   const parsed=await terser.minify(input,{ecma:2022,compress:false,mangle:false,module:false,
    format:{comments:'some',beautify:false}});
   if(!parsed.code)throw Error('JavaScript minification produced empty output: '+relative);
   result=parsed.code+'\n';
  }else{
   const parsed=new CleanCSS({level:1,format:false,rebase:false,inline:false}).minify(input);
   if(parsed.errors.length)throw Error('CSS minification failed: '+relative+': '+parsed.errors.join('; '));
   if(!parsed.styles)throw Error('CSS minification produced empty output: '+relative);
   result=parsed.styles+'\n';
  }
  const originalBytes=Buffer.byteLength(input),optimizedBytes=Buffer.byteLength(result);
  // Avoid bigger packages and keep the original if the tool made no reduction.
  if(optimizedBytes>=originalBytes)continue;
  const target=path.join(output,...relative.split('/'));
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,result,'utf8');
  summary.files.push({path:relative,originalBytes,optimizedBytes,savedBytes:originalBytes-optimizedBytes});
  optimized++;bytesSaved+=originalBytes-optimizedBytes;
 }
 await fs.writeFile(path.join(output,'optimization-manifest.json'),JSON.stringify(summary,null,2)+'\n');
 process.stdout.write('Production-only minification: '+optimized+' assets, '+bytesSaved+' source bytes removed; originals unchanged.\n');
}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
