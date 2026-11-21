'use strict';
// Business Analyst preflight findings are audit evidence, not document edits.
// Each AI attempt and section is retained for the active extension session;
// after a reload the bounded, persisted mapping evidence can be exported.
const path=require('node:path');
const clean=(value,limit=5000)=>String(value??'').replace(/\0/g,'').replace(/\r\n?/g,'\n').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'').slice(0,limit).trim();
const trimList=(items,n=30)=>Array.isArray(items)?items.slice(0,n).filter(x=>x&&typeof x==='object'):[];
function create(projectId,documents){
 if(!projectId||!Array.isArray(documents)||!documents.length)throw Error('Preflight report needs a project and source document.');
 const names=documents.filter(x=>x?.digest&&x?.name).slice(0,10).map(x=>({name:clean(x.name,180),digest:clean(x.digest,80),byteDigest:/^[a-f0-9]{64}$/i.test(String(x.byteDigest||''))?String(x.byteDigest):''}));
 if(!names.length)throw Error('No verified source document available for the preflight report.');
 return {projectId:clean(projectId,100),startedAt:new Date().toISOString(),state:'checking',source:'session',documents:names,entries:[],workingBRs:[],error:'',crossSectionChecked:false};
}
function capture(session,{digest,sourceName,section,totalSections,attempt,report}){
 if(!session||!report||!session.documents.some(x=>x.digest===digest))throw Error('Unrecognized preflight source.');
 if(session.entries.length>=500)throw Error('Preflight report has exceeded the per-run section limit.');
 const item={digest,sourceName:clean(sourceName,180),section:Number(section)||1,totalSections:Number(totalSections)||1,attempt:Number(attempt)||1,
  at:new Date().toISOString(),status:report.ready?'ready':'needs-input',summary:clean(report.summary,1000),
  applied:trimList(report.applied,12),skipped:trimList(report.skipped,12),issues:trimList(report.issues,20),resolutions:trimList(report.resolutions,12)};
 session.entries.push(item);
 return session;
}
function captureCrossSection(session,{digest,sourceName,issues,totalSections}){
 if(!session||!session.documents.some(x=>x.digest===digest))throw Error('Unrecognized cross-section source.');
 if(session.entries.length>=500)throw Error('Preflight report has exceeded the per-run section limit.');
 const findings=trimList(issues,12);
 session.entries.push({digest,sourceName:clean(sourceName,180),section:null,reviewKind:'cross-section',
  totalSections:Number(totalSections)||1,attempt:null,at:new Date().toISOString(),status:'needs-review',
  summary:findings.length+' evidence-backed cross-section conflict(s) require BA review.',
  applied:[],skipped:[],issues:findings,resolutions:[]});
 return session;
}
function finish(session,{state='completed',error='',crossSectionChecked=false}={}){
 if(!session)throw Error('Missing preflight report.');
 session.state=state;session.error=clean(error,3000);session.crossSectionChecked=crossSectionChecked===true;return session;
}
function attachWorkingBR(session,{digest,ref,checks}){
 if(!session?.documents?.some(doc=>doc.digest===digest))throw Error('Unrecognized working BR source.');
 session.workingBRs=(session.workingBRs||[]).filter(item=>item.digest!==digest);
 session.workingBRs.push({digest,ref,checks:Array.isArray(checks)?checks.slice(0,12):[]});return session;
}
function fromSaved(projectId,documents,saved){
 const available=(saved||[]).filter(item=>documents.some(doc=>doc.digest===item.digest));
 if(!available.length)return null;
 const session=create(projectId,documents.filter(doc=>available.some(item=>item.digest===doc.digest)));
 session.state='completed';session.source='persisted-summary';
 session.startedAt=clean(available[0].checkedAt,60)||session.startedAt;
 session.crossSectionChecked=available.every(x=>x.crossSectionChecked===true);
 for(const entry of available){
  if(entry.workingBR)attachWorkingBR(session,{digest:entry.digest,ref:entry.workingBR,checks:entry.checks});
  const parts=Array.isArray(entry.sections)&&entry.sections.length?entry.sections:[entry];
  for(const [index,part] of parts.entries())session.entries.push({digest:entry.digest,sourceName:session.documents.find(x=>x.digest===entry.digest)?.name||'',section:parts[0]===entry?null:index+1,totalSections:parts[0]===entry?null:parts.length,attempt:null,
   at:clean(entry.checkedAt,60),status:clean(part.status,50)||'ready',summary:clean(part.summary,1000),
   applied:trimList(part.applied,12),skipped:trimList(part.skipped,12),issues:trimList(part.issues,20),resolutions:trimList(part.resolutions,12)});
  if(entry.crossSectionFindings?.length)captureCrossSection(session,{digest:entry.digest,
   sourceName:session.documents.find(x=>x.digest===entry.digest)?.name||'',issues:entry.crossSectionFindings,totalSections:parts.length});
 }
 return session;
}
function filename(projectId,sourceName){
 const base=path.basename(clean(sourceName,180)).replace(/\.(pdf|docx)$/i,'').replace(/[^a-z0-9_.-]+/gi,'-').replace(/^[.-]+|[.-]+$/g,'').slice(0,64)||'document';
 const project=clean(projectId,80).replace(/[^a-z0-9_-]+/gi,'-').slice(0,40)||'project';
 return 'ATGV-Preflight-Analyst-'+project+'-'+base+'.txt';
}
function format(session,{generatedAt=new Date().toISOString()}={}){
 if(!session?.documents?.length||!session.entries?.length)throw Error('No completed preflight findings are available to download yet.');
 const line=[],write=(...parts)=>line.push(...parts);
 write('ATGV AIATECH ASSIST','BUSINESS ANALYST - AI DOCUMENT PRE-FLIGHT REPORT','='.repeat(70),
  'Project: '+clean(session.projectId,100),'Generated: '+clean(generatedAt,80),'Started: '+clean(session.startedAt,80),
  'Processing state: '+clean(session.state,80).toUpperCase(),'Report source: '+(session.source==='persisted-summary'?'saved bounded preflight evidence':'live section-by-section results'),
  'Original uploaded file: UNCHANGED','');
 if(session.source==='persisted-summary')write('NOTE: This saved record is a bounded summary. Per-section attempts from the prior session may no longer be available.','');
 write('INTERPRETATION','Provisional industry-standard recommendations are guidance, NOT approved business requirements or design decisions.',
  'Unresolved business-rule conflicts require Business Analyst review.','');
 if(session.error)write('RUN DIAGNOSTIC',clean(session.error,3000),'');
 if(session.crossSectionChecked)write('Cross-section mapped claims review: completed','');
 for(const document of session.documents){
  const entries=session.entries.filter(x=>x.digest===document.digest);
  if(!entries.length)continue;
  write('-'.repeat(70),'DOCUMENT: '+clean(document.name,180),'Extracted text SHA-256: '+clean(document.digest,80),
   'Original file SHA-256: '+(document.byteDigest||'Not recorded for this upload'),
   'Recorded section checks: '+entries.length,'');
  write('CORRECTIONS AND CHANGES BASED ON THE ORIGINAL DOCUMENT',
   'Original uploaded file: UNCHANGED. Any text corrections below apply only to preflight working text.',
   'Unapplied suggestions and provisional mapping guidance are not approved requirements.','');
  const locations=entries.map(part=>part.reviewKind==='cross-section'?'Cross-section consistency review':part.section==null?'Saved aggregate summary':'Section '+part.section+'/'+part.totalSections+(part.attempt==null?' - Final check':' - Attempt '+part.attempt+'/2'));
  const corrections=entries.flatMap((part,index)=>trimList(part.applied,12).map(item=>({item,where:locations[index],ready:part.status==='ready'})));
  write('RECORDED WORKING-TEXT CORRECTIONS: '+corrections.length);
  if(!corrections.length)write('  None. No automatic source text correction was recorded.');
  for(const [i,{item,where,ready}] of corrections.entries())write('  '+(i+1)+'. '+where,
   '     Original text: '+(clean(item.before,500)||'(not recorded)'),
   '     Working text after correction: '+(clean(item.after,500)||'(not recorded)'),
   '     Reason: '+(clean(item.reason,500)||'(not recorded)'),
   '     Status: '+(session.state==='completed'&&ready?'Used in the working BR sent to mapping.':'Working text prepared; mapping from this check is not confirmed.'));
  const proposals=entries.flatMap((part,index)=>trimList(part.skipped,12).map(item=>({item,where:locations[index]})));
  write('PROPOSED TEXT CHANGES NOT APPLIED: '+proposals.length);
  if(!proposals.length)write('  None.');
  for(const [i,{item,where}] of proposals.entries())write('  '+(i+1)+'. '+where,
   '     '+(item.sourceVerified?'Verified original text: ':'Proposed original text (not verified): ')+(clean(item.before,500)||'(not recorded)'),
   '     Proposed replacement: '+(clean(item.after,500)||'(not recorded)'),
   '     Reason suggested: '+(clean(item.reason,500)||'(not recorded)'),
   '     Status: NOT APPLIED; the suggested correction did not pass validation.');
  const guidance=entries.flatMap((part,index)=>trimList(part.resolutions,12).map(item=>({item,where:locations[index],ready:part.status==='ready'})));
  write('PROVISIONAL MAPPING GUIDANCE: '+guidance.length);
  if(!guidance.length)write('  None.');
  for(const [i,{item,where,ready}] of guidance.entries())write('  '+(i+1)+'. '+where,
   '     Original excerpt: '+(clean(item.sourceExcerpt,300)||'No verified quotation available.'),
   '     Finding (AI description): '+(clean(item.issue,1000)||'(not recorded)'),
   '     Proposed guidance: '+(clean(item.resolution,5000)||'(not recorded)'),
   '     Basis: '+(clean(item.standard,800)||'(not recorded)'),
   '     Status: '+(session.state==='completed'&&ready?'Provided as provisional mapping guidance; review resulting answers.':'Provisional only; mapping from this check is not confirmed.'));
  const working=(session.workingBRs||[]).find(item=>item.digest===document.digest);
  write('','WORKING BR VALIDATION');
  if(working?.checks?.length){
   for(const check of working.checks)write('  '+clean(check.label,200)+': '+clean(check.status,30));
   write('  Working document SHA-256: '+clean(working.ref?.digest,80));
  }else write('  Working BR validation was not recorded for this report.');
  write('  Application and acceptance tests: NOT RUN; these require an implemented application.');
  write('');
  for(const [index,part] of entries.entries()){
   const sectionLabel=locations[index];
   write('CHECK '+(index+1)+': '+sectionLabel,'Checked at: '+clean(part.at,80),
    'Result: '+clean(part.status,60).toUpperCase(),'Summary: '+clean(part.summary,1000)||'(none)','');
   const applied=trimList(part.applied,12),skipped=trimList(part.skipped,12),recommendations=trimList(part.resolutions,12),issues=trimList(part.issues,20);
   write('SAFE TEXT CORRECTIONS: '+applied.length);
   if(applied.length)for(const [i,item] of applied.entries())write('  '+(i+1)+'. Before: '+clean(item.before,500),'     After: '+clean(item.after,500),'     Reason: '+clean(item.reason,500));
   else write('  None. Original file not modified.');
   if(skipped.length){write('UNAPPLIED CORRECTION PROPOSALS: '+skipped.length);
    for(const [i,item] of skipped.entries())write('  '+(i+1)+'. '+clean(item.before,500),'     Proposed replacement: '+clean(item.after,500),'     Reason: '+clean(item.reason,500));}
   write('PROVISIONAL INDUSTRY-STANDARD RECOMMENDATIONS: '+recommendations.length);
   if(!recommendations.length)write('  None.');
   for(const [i,item] of recommendations.entries()){
    write('  '+(i+1)+'. Category: '+clean(item.category,100),
     '     Standard: '+clean(item.standard,800),'     Finding: '+clean(item.issue,1000),
     '     Recommendation: '+clean(item.resolution,5000),'     Rationale: '+clean(item.rationale,2000),
     '     Approval: PROVISIONAL (not approved as part of source BR)');
   }
   write('ISSUES / WARNINGS / BLOCKERS: '+issues.length);
   if(!issues.length)write('  None.');
   for(const [i,item] of issues.entries())write('  '+(i+1)+'. ['+clean(item.severity,50).toUpperCase()+'] '+clean(item.category,100),
    '     Finding: '+clean(item.detail,2000),'     Suggested action: '+clean(item.suggestion,2000));
   write('');
  }
 }
 return line.join('\n').replace(/\n*$/,'\n');
}
module.exports={create,capture,captureCrossSection,attachWorkingBR,finish,fromSaved,filename,format};
