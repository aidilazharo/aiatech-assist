'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
// Each file runs exactly once. This is a primary file-level classification,
// not a claim that every assertion in a mixed file has the same test type.
const groups={
 smoke:'Smoke',
 unit:'Unit',
 ui:'UI & Accessibility',
 integration:'Integration',
 security:'Security & Integrity',
 e2e:'End-to-End & Functional',
 performance:'Performance & Stress',
 platform:'Cross-Platform',
 recovery:'Recovery & Resilience',
 regression:'Regression'
};
function classify(file){
 const name=path.basename(file).replace(/^v\d+-/,'').replace(/\.test\.js$/,'');
 if(/^(bootstrap|extension|opening-flow|startup-flow|startup-setup|network-health|ui-shell|production-repository-routing)$/.test(name))return 'smoke';
 if(/windows|linux|macos|cross-platform|portable-command|line-endings/.test(name))return 'platform';
 if(/stress|performance|concurrency|load-test/.test(name))return 'performance';
 if(/security|integrity|permission|credential|ownership|scope-lock|duplicate-guard|delete-everywhere|reset-everywhere|approval-conflict|locked-harness/.test(name))return 'security';
 if(/e2e|lifecycle-e2e|fullstack|integrated-handoff|real-repository|one-click-stack-bootstrap|development-handoff|delivery-execution|delivery-completion|ux-pipeline|multi-br-revision/.test(name))return 'e2e';
 if(/recovery|rollback|retry|resilience|checkpoint|reconciliation|self-heal|interrupted|force-reset/.test(name))return 'recovery';
 if(/layout|ui-shell|(?:^|-)ui(?:-|$)|webview|modal|toolbar|datatable|progress|stepper|navigation|header|sidebar|badge|visual|preview-pane|dropdown|tabs|waveform|guide|responsive|card|picker|notification|presentation|geometry|alignment|overflow|docking|simplification|compact/.test(name))return 'ui';
 if(/integration|connector|remote-api|sqlite|confluence|github|jira|catalog|repo-sync|repository|roster|sync|service|handoff|vendor|release|update|ai-provider|ai-router|codex|mock-api/.test(name))return 'integration';
 if(/^(core|discovery|projects|tech-stacks|document-editor|lightweight-diagram|custom-sdlc|sdlc-work|ai-change-resolution|project-effort-register|project-delivery-planning|role-plans|assurance-plans|operations-plans|role-step-engine|change-traceability|evidence-questions-tasks|model-jira|plan-criterion-tdd)$/.test(name))return 'unit';
 return 'regression';
}
function inventory(dir=path.join(root,'test')){
 const files=fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isFile()&&x.name.endsWith('.test.js')).map(x=>x.name).sort();
 const result=Object.fromEntries(Object.keys(groups).map(key=>[key,[]]));
 for(const name of files)result[classify(name)].push(name);
 return result;
}
function audit(dir=path.join(root,'test')){
 const files=inventory(dir),hashes=new Map(),titles=new Map();
 for(const name of Object.values(files).flat()){
  const source=fs.readFileSync(path.join(dir,name),'utf8').replace(/\r\n/g,'\n');
  const digest=crypto.createHash('sha256').update(source).digest('hex');
  if(!hashes.has(digest))hashes.set(digest,[]);
  hashes.get(digest).push(name);
  // Literal titles are candidates for human review only; never delete based on names.
  for(const match of source.matchAll(/\b(?:test|it)\s*\(\s*(['"])((?:\\.|(?!\1)[^\\\n])*)\1\s*,/g)){
   const key=match[2];
   if(!titles.has(key))titles.set(key,[]);
   titles.get(key).push(name);
  }
 }
 return {files,duplicateFiles:[...hashes.values()].filter(x=>x.length>1),
  repeatedTitles:[...titles.entries()].filter(([,x])=>x.length>1)};
}
function summary(output){
 const read=key=>{const matches=[...output.matchAll(new RegExp('^# '+key+' (\\d+)\\s*$','gm'))];return matches.length?Number(matches[matches.length-1][1]):null;};
 return {tests:read('tests'),pass:read('pass'),fail:read('fail'),cancelled:read('cancelled'),skipped:read('skipped'),todo:read('todo')};
}
// Keep normal runs concise, but surface actionable failure diagnostics in the
// parent release log so a single uploaded build log is sufficient for triage.
function failureDetails(output){
 const lines=output.split(/\r?\n/),details=[];
 let active=false,indent='',block='',count=0,stackCount=0;
 const clean=value=>String(value).replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').replace(/(Bearer\s+|Basic\s+)[A-Za-z0-9+/_=.-]+/gi,'$1[redacted]').replace(/\b(?:ghp_|github_pat_|sk-|ATATT)[A-Za-z0-9_-]+/g,'[redacted]').replace(/((?:password|secret|api[_-]?key|access[_-]?token|authorization)\s*[:=]\s*)[^\s,;]+/gi,'$1[redacted]').slice(0,700);
 for(const line of lines){
  const test=/^(\s*)not ok \d+\b/.exec(line);
  if(test){active=true;indent=test[1]+'  ';block='';count=0;stackCount=0;details.push(clean(line.trim()));continue;}
  if(!active)continue;
  const own=line.startsWith(indent)&&!/\s/.test(line[indent.length]||' ');
  const field=own&&/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line.slice(indent.length));
  if(own&&line.slice(indent.length)==='...'){active=false;block='';continue;}
  if(!line.startsWith(indent)&&/^\s*(?:ok \d+\b|# Subtest:|# tests\b)/.test(line)){active=false;continue;}
  if(field){
   const [,key,value]=field;block='';
   if(['location','failureType','error','code','name','operator'].includes(key)){
    details.push('  '+clean(key+': '+value));
    if(key==='error'&&/^[|>][-+]?$/.test(value)){block='error';count=0;}
   }else if(key==='stack'){block='stack';stackCount=0;if(value&&!/^[|>][-+]?$/.test(value))details.push('  '+clean(value));}
   continue;
  }
  if(!line.startsWith(indent+'  '))continue;
  const value=line.trim();
  if(block==='error'&&value&&count<4){details.push('    '+clean(value));count++;}
  if(block==='stack'&&/^(?:at\s|Error:|AssertionError)/.test(value)&&stackCount++<6)details.push('    '+clean(value));
 }
 return details.slice(0,500);
}
function runChild(args,log){
 const fd=fs.openSync(log,'w');
 try{
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:['ignore',fd,fd],windowsHide:true});
  if(result.error)fs.writeSync(fd,'\nRunner error: '+result.error.message+'\n');
  if(result.signal)fs.writeSync(fd,'\nRunner signal: '+result.signal+'\n');
  return result.status===0&&!result.error&&!result.signal;
 }finally{fs.closeSync(fd);}
}
function main(args=process.argv.slice(2)){
 if(args.length>1||args.length===1&&args[0]!=='all'&&args[0]!=='--audit'&&!Object.hasOwn(groups,args[0])){
  console.error('Usage: node scripts/run-test-groups.js [all|--audit|'+Object.keys(groups).join('|')+']');return 2;
 }
 const selected=args[0]||'all',files=inventory();
 const total=Object.values(files).flat().length;
 if(!total){console.error('No test files found.');return 1;}
 const logDir=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-test-'));
 if(selected==='--audit'){
  const report=audit();
  const output=path.join(logDir,'audit.json');
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  for(const [key,label] of Object.entries(groups))console.log(label+': '+report.files[key].length+' files');
  console.log('Total: '+total+' files; duplicate files: '+report.duplicateFiles.length+' sets; repeated literal titles: '+report.repeatedTitles.length+' candidates');
  console.log('Audit report: '+output);return 0;
 }
 console.log('ATGV test groups');
 if(!runChild(['scripts/generate-source-test-index.js'],path.join(logDir,'source-index.log'))){
  console.error('Source index: FAILED');console.error('Detailed logs: '+logDir);return 1;
 }
 const keys=selected==='all'?Object.keys(groups):[selected];
 let failed=0;const totals={tests:0,pass:0,fail:0,cancelled:0,skipped:0,todo:0};
 for(const key of keys){
  const label=groups[key],entries=files[key];
  if(!entries.length){console.log(label+': NO FILES');continue;}
  // Explicit paths avoid Windows glob inconsistencies. Keep the local-network
  // guard and default Node isolation/concurrency for all existing tests.
  console.log(label+' ('+entries.length+' files) ...');
  const started=Date.now(),log=path.join(logDir,key+'.log');
  const ok=runChild(['--require','./test/local-network-only.js','--test','--test-reporter=tap',...entries.map(name=>'test/'+name)],log);
  const output=fs.readFileSync(log,'utf8'),stats=summary(output);
  const complete=Object.values(stats).every(Number.isInteger);
  const passed=ok&&complete&&stats.fail===0&&stats.cancelled===0&&stats.tests>0;
  if(!passed){failed++;for(const detail of failureDetails(output))console.error(detail);}
  if(complete)for(const key of Object.keys(totals))totals[key]+=stats[key];
  console.log(label+': '+(passed?'PASS':'FAIL')+(complete?' | '+stats.pass+' passed, '+stats.fail+' failed, '+stats.skipped+' skipped, '+stats.cancelled+' cancelled, '+stats.todo+' todo':' | incomplete runner output')+' | '+((Date.now()-started)/1000).toFixed(1)+'s');
 }
 if(!keys.some(key=>files[key].length))failed++;
 console.log('Total: '+totals.tests+' tests | '+totals.pass+' passed, '+totals.fail+' failed, '+totals.skipped+' skipped, '+totals.cancelled+' cancelled, '+totals.todo+' todo | '+failed+' failed groups');
 console.log('Detailed logs: '+logDir);
 return failed?1:0;
}
if(require.main===module)process.exitCode=main();
module.exports={groups,classify,inventory,audit,summary,failureDetails};
