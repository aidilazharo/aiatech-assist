'use strict';
/**
 * Guards against RED tests that impose unapproved implementation details.
 * Heuristics deliberately require multiple independent indicators to avoid
 * labeling ordinary persistence or validation defects as test failures.
 * This module never mutates a test, approved BR, or application source.
 */
const asText = value => String(value || '');
function explicitNetworkRequirement(brText){
  // An HTTP 400 API contract does not demand that invalid UI input be sent over
  // the network: accessible client-side validation can short-circuit it.
  return /(?:user interface|frontend|form|browser|client|UI)[^\n.]{0,125}(?:must|shall|required to)[^\n.]{0,90}(?:send|submit|post|request)[^\n.]{0,70}(?:invalid|overlength|too long)/i.test(asText(brText)) ||
    /(?:invalid|overlength|too long)[^\n.]{0,120}(?:must|shall|required to)[^\n.]{0,70}(?:send|submit|post|request)[^\n.]{0,70}(?:UI|browser|frontend|client|form)/i.test(asText(brText));
}
function demandsOverlengthNetworkCall(code){
  const src=asText(code);
  const inputAction=/\b(?:userEvent|user|fireEvent)\b[\s\S]{0,250}\b(?:click|type|change|submit)\s*\(|\bscreen\.getByRole\s*\(\s*['"]button['"]/i.test(src);
  const fieldInvalid=/\b(?:overlength|too.long|too long|maxLength|more than 80|length error|repeat\s*\(\s*(?:8[1-9]|9\d|[1-9]\d\d)\s*\))/i.test(src);
  const spyCapture=/\b(?:rejectedCreateResponse|rejectedResponse|invalidCreateResponse|invalidResponse)\b/.test(src) && /(?:\btoBeDefined\s*\(|\bassert\.(?:ok|strictEqual)\s*\()/i.test(src);
  const httpStatus=/\b(?:status|400)\b/.test(src);
  // Only a *UI-triggered* request-observation assertion is the problem. A
  // separate direct-HTTP rejection test is valid even when the UI blocks input.
  return !!(inputAction&&fieldInvalid&&spyCapture&&httpStatus);
}
function hasDirectFetchSelfDelegation(code){
  const src=asText(code);
  // A spy replacing global fetch and delegating to fetch/globalThis.fetch
  // directly calls itself. Delegation to an ORIGINAL saved fetch is valid.
  const spy=/\b(?:vi|jest)\.spyOn\s*\(\s*(?:globalThis|global|window)\s*,\s*['"]fetch['"]\s*\)\s*\.mockImplementation(?:Once)?\s*\(/g;
  for(const match of src.matchAll(spy)){
    const after=src.slice(match.index+match[0].length,match.index+match[0].length+650);
    const body=after.match(/=>\s*(?:\{([\s\S]{0,500})\}|(?:([^;\n]{0,400})))\s*\)?/);
    if(body&&/(?:\bglobalThis\.fetch\s*\(|\bwindow\.fetch\s*\(|(?<![\w.])fetch\s*\()/.test(body[1]||body[2]||''))return true;
  }
  const assign=/\b(?:globalThis|global|window)\.fetch\s*=\s*(?:vi|jest)\.fn\s*\(/g;
  for(const match of src.matchAll(assign)){
    const after=src.slice(match.index+match[0].length,match.index+match[0].length+650);
    const body=after.match(/=>\s*(?:\{([\s\S]{0,500})\}|(?:([^;\n]{0,400})))\s*\)?/);
    if(body&&/(?:\bglobalThis\.fetch\s*\(|\bwindow\.fetch\s*\(|(?<![\w.])fetch\s*\()/.test(body[1]||body[2]||''))return true;
  }
  return false;
}
function inspectGeneratedRedTests(files,brText){
  const issues=[];
  for(const f of files||[]){
    const code=asText(f.content||f.source),file=asText(f.path||f.relative||f.name);
    if(hasDirectFetchSelfDelegation(code))issues.push({file,kind:'recursive-fetch-mock',message:'Mocked global fetch delegates to itself, causing infinite recursion. Save and call the original fetch before replacing it, or use a real HTTP server without a global fetch spy.'});
    if(!explicitNetworkRequirement(brText)&&demandsOverlengthNetworkCall(code))issues.push({file,kind:'unapproved-ui-network-assertion',message:'An overlength UI submission test requires an observed HTTP 400 response. The approved HTTP 400 API contract does not require the UI to transmit invalid input. Test direct POST /api/... returning 400 separately, and assert a visible accessible UI error without requiring a fetch.'});
  }
  return issues;
}
function classifyLaterHarnessFailure(evidence,tests,brText){
  const failed=(evidence||[]).filter(row=>!row.passed);
  const logs=failed.map(row=>asText(row.logs)+'\n'+asText(row.failureDetails)).join('\n');
  const checks=inspectGeneratedRedTests(tests,brText);
  if(/Maximum call stack size exceeded/i.test(logs)){
    const match=checks.find(i=>i.kind==='recursive-fetch-mock');
    if(match)return {kind:match.kind,message:match.message+' Test: '+match.file};
  }
  if(/(?:expected undefined to be defined|rejectedCreateResponse[^\n]{0,100}undefined)/i.test(logs)){
    const match=checks.find(i=>i.kind==='unapproved-ui-network-assertion');
    if(match)return {kind:match.kind,message:match.message+' Test: '+match.file};
  }
  return null;
}
module.exports={explicitNetworkRequirement,demandsOverlengthNetworkCall,hasDirectFetchSelfDelegation,inspectGeneratedRedTests,classifyLaterHarnessFailure};
