'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {modelIdentity,selectLatest,resolveAiTarget}=require('../src/ai-models');
const {modelAvailability}=require('../src/model-status');
const {normalizeProjectInput,ProjectRegistry}=require('../src/projects');
const {validProjectKey,jiraMarker}=require('../src/remote-actions');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('Auto ranks full capability models above newer compact models',()=>{
 const catalog=[{id:'gpt-5.1-mini',vendor:'copilot',name:'GPT 5.1 Mini',version:'2026-10-24'},
  {id:'gpt-5.1',vendor:'copilot',name:'GPT 5.1',version:'2026-10-19'}];
 assert.equal(selectLatest(catalog).id,'gpt-5.1');
});
test('Manual AI selection is provider-aware, deterministic and does not silently fall back',async()=>{
 const catalog=[{id:'gpt-6',vendor:'copilot',name:'GPT 6',version:'2026-10-01'},
  {id:'gpt-6',vendor:'other',name:'GPT 6 Other',version:'2026-10-01'},
  {id:'claude-opus',vendor:'anthropic',name:'Claude Opus',version:'2026-10-10'}];
 const selected=modelIdentity(catalog[1]);
 const vscodeApi={lm:{selectChatModels:async()=>catalog}};
 const actual=await resolveAiTarget({vscodeApi,config:{provider:'auto',selectedModel:selected}});
 assert.equal(actual.model,catalog[1]);
 assert.equal((await modelAvailability({models:async()=>catalog,config:{provider:'auto',selectedModel:selected}})).name,'GPT 6 Other');
 await assert.rejects(resolveAiTarget({vscodeApi,config:{provider:'auto',selectedModel:'{"vendor":"missing","id":"model"}'}}),/manually selected/);
 assert.equal((await modelAvailability({models:async()=>catalog,config:{provider:'auto',selectedModel:'missing'}})).state,'inactive');
});
test('Jira key is normalized consistently at project save and publishing validation',async()=>{
 assert.equal(validProjectKey('fin_1'),'FIN_1');
 assert.equal(normalizeProjectInput({name:'Finance',settings:{jira:{projectKey:'fin_1'}}}).settings.jira.projectKey,'FIN_1');
 for(const candidate of ['','a','bad-key','1FIN','BAD KEY'])assert.throws(()=>validProjectKey(candidate),/project key/i);
 assert.equal(normalizeProjectInput({name:'Legacy',settings:{jira:{projectKey:'old-key'}}}).settings.jira.projectKey,'OLD-KEY');
 const config={get:key=>key==='jira.projectKey'?'fin_1':'https://company.atlassian.net'};
 assert.match(jiraMarker(config,'BR-001'),/^atgv-[0-9a-f]{24}$/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atgv-040-jira-'));
 try{const reg=new ProjectRegistry(root);let project=await reg.create({name:'Finance Project'});
  project=await reg.update(project.id,{...project,settings:{...project.settings,jira:{projectKey:'fin_1'}}});
  assert.equal((await reg.read(project.id)).settings.jira.projectKey,'FIN_1');
 }finally{fs.rmSync(root,{force:true,recursive:true});}
});
test('Model picker is an accessible modal connected to model selection commands',()=>{
 const extension=source('test/generated/extension-source.txt'),ui=source('media/start.js'),css=source('media/start.css');
 for(const id of ['headerModel','modelPicker','modelPickerList','modelPickerApply','modelPickerSettings'])assert.match(extension,new RegExp(`id="${id}"`));
 assert.match(extension,/aria-modal="true" aria-labelledby="modelPickerTitle"/);
 assert.match(extension,/case 'listAiModels':await postModelChoices\(\)/);
 assert.match(extension,/cfg\(\)\.update\('ai\.preferredVendor','',vscode\.ConfigurationTarget\.Global\)/);
 assert.match(extension,/case 'selectAiModel':await setSelectedModel\(msg\.modelId\)/);
 assert.match(ui,/send\('selectAiModel',\{modelId:modelPickerChoice\}\)/);
 assert.match(ui,/send\('listAiModels'\)/);
 assert.match(css,/\.model-choice:has\(input:checked\)/);
});
test('Jira preview verifies target project before preflight and offers an explicit picker',()=>{
 const code=source('test/generated/extension-source.txt');
 assert.match(code,/async function ensureJiraPreviewTarget\(register,\{automatic=false\}/);
 assert.match(code,/discoverJiraProjects\(initial,token\)/);
 assert.match(code,/uiQuickPick\(picks,\{title:'Select Jira project for BR preview'/);
 assert.match(code,/registry\.update\(activeProject\.id/);
 assert.match(code,/Object\.keys\(register\.synced\|\|\{\}\)\.length/);
 assert.match(code,/const target=await ensureJiraPreviewTarget\(register,\{automatic\}\)/);
 assert.match(source('media/start.js'),/baBusyTask==='jiraPreview'/);
});
