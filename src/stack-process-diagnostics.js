'use strict';
// Captures command, cwd, stdout, stderr and failure metadata for download after
// a stack action fails. Never includes the process environment or auth tokens.
const MAX_OUTPUT=256*1024;
function limited(value){const s=String(value??'');return s.length>MAX_OUTPUT?'[Earlier output truncated]\n'+s.slice(-MAX_OUTPUT):s;}
function commandLine(bin,args=[]){return [bin,...args].map(x=>String(x)).join(' ');}
function capture({stage='',bin='',args=[],cwd='',stdout='',stderr='',exitCode,signal='',error,logs=''}={}){
 const code=exitCode??error?.code??'unknown';
 return [
  '=== '+(stage||'Process')+' ===',
  'Command: '+commandLine(bin,args),
  'Working directory: '+cwd,
  'Exit code: '+code,
  'Signal: '+(signal||error?.signal||'none'),
  '--- stdout ---',limited(stdout||logs||'(empty)'),
  '--- stderr ---',limited(stderr||'(empty)'),
  ...(error?['--- process error ---',limited(error.message||error)]:[]),
  ''
 ].join('\n');
}
function attach(error,entry){
 const err=error instanceof Error?error:Error(String(error));
 const existing=String(err.diagnosticLogs||'');
 err.diagnosticLogs=[existing,capture({...entry,error:err})].filter(Boolean).join('\n');
 return err;
}
module.exports={capture,attach,limited,commandLine};
