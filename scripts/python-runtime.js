'use strict';
const {spawnSync} = require('node:child_process');
// Python is needed to build/verify VSIX from source, never to run the extension.
// Windows installs commonly expose `py -3` or `python`, not `python3`.
function python(args,options={}){
 const candidates=process.platform==='win32' ? [['py',['-3']],['python',[]],['python3',[]]] : [['python3',[]],['python',[]]];
 for(const [bin,prefix] of candidates){
  const result=spawnSync(bin,[...prefix,...args],options);
  if(!result.error || result.error.code!=='ENOENT')return result;
 }
 throw Error('Python 3 is required only for source packaging. Install Python 3 (Windows: Python Launcher `py -3`) and retry.');
}
module.exports={python};
