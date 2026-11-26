'use strict';
// Run npm through its JavaScript CLI on Windows instead of spawning npm.cmd
// (Node's shell:false child_process APIs cannot launch .cmd/.bat reliably).
// No shell interpolation and no globally installed native npm dependencies.
const fs = require('node:fs');
const path = require('node:path');
const execute=require('node:util').promisify(require('node:child_process').execFile);

function isExecutableFile(file) {
    try {
        fs.accessSync(file, fs.constants.X_OK);
        return fs.statSync(file).isFile();
    } catch {
        return false;
    }
}

function nodeExecutable({ platform = process.platform, env = process.env,
    executable = isExecutableFile } = {}) {
    const windows = platform === 'win32';
    const paths = windows ? path.win32 : path.posix;
    const folders = (windows ? env.Path || env.PATH || '' : env.PATH || '').split(paths.delimiter);
    for (const entry of folders) {
        const folder = windows ? entry.replace(/^"|"$/g, '') : entry;
        if (!paths.isAbsolute(folder)) continue;
        const file = paths.join(folder, windows ? 'node.exe' : 'node');
        if (executable(file)) return file;
    }
    throw Error('Node.js is unavailable for the mock API. Install Node.js, add it to PATH, and restart VS Code.');
}

// Search only host PATH and known installation locations, never project source.
function windowsNodeCandidates(env=process.env){
 const win=path.win32;
 const folders=[...String(env.Path||env.PATH||'').split(';'),env.ATGV_NODE24_HOME,
  env.ProgramW6432&&win.join(env.ProgramW6432,'nodejs'),
  env.ProgramFiles&&win.join(env.ProgramFiles,'nodejs'),
  env.LOCALAPPDATA&&win.join(env.LOCALAPPDATA,'Programs','nodejs')];
 const seen=new Set(),result=[];
 for(const value of folders){
  const folder=String(value||'').trim().replace(/^"|"$/g,'');
  if(!win.isAbsolute(folder)||! /^[A-Za-z]:\\/.test(folder))continue;
  const node=win.join(folder,'node.exe'),key=node.toLowerCase();
  if(!seen.has(key)){seen.add(key);result.push(node);}
 }
 return result;
}
function selectNode24Version(output){
 const versions=[...new Set(String(output||'').split(/\r?\n/).map(line=>line.trim()).filter(line=>/^24\.\d+\.\d+$/.test(line)))];
 versions.sort((a,b)=>{const aa=a.split('.').map(Number),bb=b.split('.').map(Number);return bb[1]-aa[1]||bb[2]-aa[2];});
 return versions[0]||'';
}
async function resolveWindowsNode24({cwd,runner=execute,signal,platform=process.platform,env=process.env,executable=isExecutableFile,exists=fs.existsSync,onProgress=async()=>{}}={}){
 const check=()=>{if(signal?.aborted)throw Error('Node.js runtime check cancelled.');};
 const opts={cwd,signal,windowsHide:true,timeout:10000};
 const probeArgs=['-p','process.platform+" "+process.arch+" "+process.versions.node'];
 const observed=[];
 // Cross-platform fixture support: real bundle entry points only call this on Windows.
 const candidates=platform==='win32'?windowsNodeCandidates(env):[nodeExecutable()];
 for(const node of candidates){
  check();
  if(platform==='win32'&&!executable(node))continue;
  try{
   const result=await runner(node,probeArgs,opts);
   check();
   const detected=String(result.stdout||'').trim();
   const match=/^win32 x64 (24\.\d+\.\d+)$/.exec(detected);
   const home=path.win32.dirname(node);
   const cli=path.win32.join(home,'node_modules','npm','bin','npm-cli.js');
   if(!match){observed.push(node+' → '+detected.slice(0,100));continue;}
   if(platform==='win32'&&!exists(cli)){observed.push(node+' → '+detected+' (npm missing)');continue;}
   if(platform==='win32'){
    // Process-local only: npm CLI and child processes must use the same runtime.
    const prior=String(env.Path||env.PATH||'');
    const value=[home,...prior.split(';').filter(entry=>entry.replace(/^"|"$/g,'').toLowerCase()!==home.toLowerCase())].filter(Boolean).join(';');
    env.Path=value;env.PATH=value;
   }
   await onProgress('Verified Windows x64 Node.js '+match[1]+' at '+node);
   return node;
  }catch(error){check();observed.push(node+' → '+String(error.code||error.message||error).slice(0,100));}
 }
 const error=Error('ATGV Windows bundle requires Windows x64 Node.js 24 with npm. '+(observed.length?'Detected: '+observed.join('; ')+'. ':'No compatible installation found. ')+'Install a company-approved Node.js 24 x64 runtime or set ATGV_NODE24_HOME to its absolute folder.');
 error.code='ATGV_NODE24_REQUIRED';throw error;
}
// Called only after explicit user approval. Winget enforces its own package and
// installer verification; never download from project URLs or bypass policy.
async function installWindowsNode24({runner=execute,signal,onProgress=async()=>{}}={}){
 if(signal?.aborted)throw Error('Node.js installation cancelled.');
 const id='OpenJS.NodeJS.LTS',opts={signal,windowsHide:true,timeout:120000,maxBuffer:1024*1024};
 const list=await runner('winget',['show','--id',id,'--exact','--source','winget','--versions','--disable-interactivity'],opts);
 const version=selectNode24Version(list.stdout);
 if(!version)throw Error('Windows Package Manager did not list an approved Node.js 24 release. Ask IT for the offline installer.');
 if(signal?.aborted)throw Error('Node.js installation cancelled.');
 await onProgress('Installing Node.js '+version+' x64 using Windows Package Manager…');
 await runner('winget',['install','--id',id,'--exact','--source','winget','--version',version,'--architecture','x64','--accept-package-agreements','--accept-source-agreements','--disable-interactivity'],{...opts,timeout:600000});
 if(signal?.aborted)throw Error('Node.js installation cancelled.');
 await onProgress('Node.js installer completed; rechecking runtime and npm.');
 return version;
}
function npmCommand(args = [], { platform = process.platform, env = process.env,
    exists = fs.existsSync } = {}) {
    if (platform !== 'win32') return { bin: 'npm', args: [...args] };
    const win = path.win32;
    const paths = String(env.Path || env.PATH || '').split(';').filter(Boolean).map(p => p.replace(/^"|"$/g, ''));
    // Windows PowerShell may refuse npm.ps1. Launch npm-cli.js under node.exe
    // with shell:false instead of depending on npm.cmd or execution policies.
    const candidates = [];
    const home = paths.find(p => exists(win.join(p, 'node.exe')));
    if(home)candidates.push(win.join(home,'node_modules','npm','bin','npm-cli.js'));
    if (env.npm_execpath && /[\\/]npm-cli\.js$/i.test(env.npm_execpath)) candidates.push(env.npm_execpath);
    for (const folder of paths) {
        candidates.push(win.join(folder, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
        candidates.push(win.resolve(folder, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
        candidates.push(win.join(folder, 'npm', 'bin', 'npm-cli.js'));
    }
    const cli = candidates.find(p => exists(p));
    if (!cli) throw Error('Windows npm executable is unavailable. Install Node.js LTS with npm, ensure node.exe and npm.cmd are on PATH, restart VS Code, then retry.');
    return { bin: home ? win.join(home, 'node.exe') : 'node.exe', args: [cli, ...args] };
}
// The official @openai/codex npm package ships a portable JS CLI as well as
// Windows .cmd shims. Prefer the JS program under node.exe and never use a shell.
function codexCommand(binary, args = [], { platform = process.platform, exists = fs.existsSync } = {}) {
    if (platform !== 'win32') return { bin: binary, args: [...args] };
    if (/\.js$/i.test(binary)) return { bin: 'node.exe', args: [binary, ...args] };
    if (/\.cmd$/i.test(binary)) {
        const root = path.win32.resolve(path.win32.dirname(binary), '..', '@openai', 'codex', 'bin', 'codex.js');
        if (exists(root)) return { bin: 'node.exe', args: [root, ...args] };
        throw Error('Codex Windows launcher requires the official @openai/codex JavaScript CLI or codex.exe. Reinstall Codex using the ATGV installer.');
    }
    return { bin: binary, args: [...args] };
}
function mavenCommand(args = [], { platform = process.platform, env = process.env } = {}) {
    if (platform !== 'win32') return { bin: 'mvn', args: [...args] };
    // Maven distributes mvn.cmd on Windows. Only accept literal arguments;
    // quoting protects spaces and parentheses without allowing cmd expansion.
    if (args.some(arg => /["% !&|<>^\r\n]/.test(String(arg))))
        throw Error('Unsafe argument for the Windows Maven launcher.');
    return { bin: env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'mvn.cmd ' + args.map(arg => '"' + arg + '"').join(' ')] };
}
module.exports = { nodeExecutable, npmCommand, codexCommand, mavenCommand, windowsNodeCandidates, resolveWindowsNode24, selectNode24Version, installWindowsNode24 };
