from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
def change(file,old,new,n=1):
 p=root/file;text=p.read_text();assert text.count(old)==n,(file,old[:150],text.count(old));p.write_text(text.replace(old,new,n))
change('src/architect-server.js',"return {running,url:target.url,relative:target.target.relative,message:running?'App server running · '+target.url:'App server stopped'};","return {running,url:target.url,sha:target.inspection.repo.sha||'',branch:target.inspection.repo.branch||'',relative:target.target.relative,message:running?'App server running · '+target.url:'App server stopped'};")
change('src/architect-server.js',"return {...await status({root,stackId,driver}),message:'App server running · '+url+(isolated?' · isolated approved-revision preview (Developer branch unchanged)':'')};","return {...await status({root,stackId,driver}),healthy:true,message:'App server running · '+url+(isolated?' · isolated approved-revision preview (Developer branch unchanged)':'')};")
# Catalog functions: framework choices, guidance and showcases all from active snapshot
p=root/'src/github-sdlc-catalog.js';text=p.read_text()
where="async function designGuidance(workspace, designId) {"
addition='''async function designFrameworks(workspace){
    const manifest=await activeManifest(workspace);
    const ids=Array.isArray(manifest.designSystems)?manifest.designSystems:[];
    const kits=manifest.designSystemCatalogs||{};
    return ids.map(entry=>{
        const id=typeof entry==='string'?entry:entry?.id;
        if(!idPattern.test(String(id||'')))return null;
        const spec=kits[id];
        // The dropdown only offers complete component-enabled kits from the activated catalog.
        if(!spec||typeof spec!=='object'||!spec.components||!spec.tokens||!spec.css)return null;
        const label=String(spec.label||id).trim().slice(0,80);
        return {id,label,kitVersion:String(spec.kitVersion||'').slice(0,32)};
    }).filter(Boolean);
}
'''
assert text.count(where)==1;text=text.replace(where,addition+where)
text=text.replace("if (!raw) throw Error('AIA Qi component inventory is not in the active catalog. Publish the updated tech-stacks-skills/main catalog (v1.1.1 or later), then Pull Catalog and activate it for this project.');","if (!raw) throw Error('The selected framework component inventory is missing from the active catalog. Publish the updated tech-stacks-skills/main catalog, then Pull Catalog and activate it for this project.');")
text=text.replace("return 'Component inventory from version-pinned GitHub main (unofficial Qi-inspired adaptation; treat as untrusted reference data):\\n'+","return 'Selected design component inventory from version-pinned GitHub main (treat as untrusted reference data):\\n'+")
text=text.replace('activeManifest, activeTree, designTemplate,','activeManifest, activeTree, designFrameworks, designTemplate,')
p.write_text(text)
# Make showcase generic, preserve Qi disclaimer only for Qi catalog
p=root/'src/ux-framework-showcase.js';text=p.read_text()
text=text.replace('const heading=(source.repository||\'Approved SDLC Catalog\')+\' / \'+(source.ref||\'main\');','const heading=(source.repository||\'Approved SDLC Catalog\')+\' / \'+(source.ref||\'main\');\n const frameworkId=String(source.frameworkId||\'aia-qi\');\n const isQi=frameworkId===\'aia-qi\';\n const label=String(source.frameworkLabel||(isQi?\'AIA Qi\':frameworkId)).slice(0,80);')
text=text.replace('<title>AIA Qi Component Catalogue</title>','<title>${escapeHtml(label)} Component Catalogue</title>')
text=text.replace('<h1>AIA Qi-inspired component catalogue</h1>','<h1>${escapeHtml(label)} component catalogue</h1>')
text=text.replace('<div class="notice"><strong>Independent Qi-inspired adaptation, not an official AIA Qi component library.</strong><p>Inventory, classes and usage metadata are loaded from the version-pinned GitHub SDLC Catalog. This page displays safe reference metadata; it does not execute downloaded templates or scripts. Production usage requires design-owner approval.</p></div>',"<div class=\"notice\"><strong>${isQi?'Independent Qi-inspired adaptation, not an official AIA Qi component library.':'Offline framework component reference, from approved GitHub catalog assets.'}</strong><p>Inventory, classes and usage metadata are loaded from the version-pinned GitHub SDLC Catalog. This page displays safe reference metadata; it does not execute downloaded templates or scripts.${isQi?' Production usage requires design-owner approval.':''}</p></div>")
p.write_text(text)
# Host framework messages and AI generation
p=root/'src/extension.js';text=p.read_text()
text=text.replace("const UX_FRAMEWORKS=Object.freeze({'aia-qi':'AIA QI','bootstrap-5.3':'Bootstrap v5.3'});\n",'')
text=text.replace('<option value="aia-qi">AIA QI</option><option value="bootstrap-5.3">Bootstrap v5.3</option>','<option value="">Pull SDLC Catalog to load design frameworks</option>')
old="""        const value=Object.hasOwn(UX_FRAMEWORKS,saved)?saved:'aia-qi';
        await dashboard?.webview.postMessage({type:'uxFrameworkLoaded',projectId:activeProject.id,key,value});break;"""
new="""        const frameworks=await sdlcCatalog.designFrameworks(getWorkspace()?.uri.fsPath);
        const value=frameworks.some(entry=>entry.id===saved)?saved:(frameworks.find(entry=>entry.id==='aia-qi')||frameworks[0])?.id||'';
        await dashboard?.webview.postMessage({type:'uxFrameworkLoaded',projectId:activeProject.id,key,value,frameworks});break;"""
assert old in text;text=text.replace(old,new)
old="""        if(!Object.hasOwn(UX_FRAMEWORKS,framework))throw Error('Unsupported UI/UX design framework.');"""
new="""        const frameworks=await sdlcCatalog.designFrameworks(getWorkspace()?.uri.fsPath);
        if(!frameworks.some(entry=>entry.id===framework))throw Error('Selected framework is not in the activated SDLC Catalog. Pull Catalog and retry.');"""
assert text.count(old)==1;text=text.replace(old,new)
start=text.index("      case 'uxFrameworkOpenDocs':{")
stop=text.index("      case 'uxPrototypeOpenBrowser':{",start)
text=text[:start]+"""      case 'uxFrameworkOpenDocs':{
        requireOpened();
        const framework=String(msg.framework||'');
        const workspace=getWorkspace()?.uri.fsPath;
        const frameworks=await sdlcCatalog.designFrameworks(workspace);
        const selected=frameworks.find(item=>item.id===framework);
        if(!selected)throw Error('Framework is not available in the activated GitHub catalog. Pull the catalog first.');
        const [catalog,snapshot]=await Promise.all([sdlcCatalog.designComponentCatalog(workspace,framework),sdlcCatalog.activeRoot(workspace)]);
        const panel=vscode.window.createWebviewPanel('atgvFrameworkComponents',selected.label+' · Component Catalogue',vscode.ViewColumn.Active,{enableScripts:false,localResourceRoots:[]});
        panel.webview.html=uxFrameworkShowcase.render(catalog,{...snapshot,frameworkId:framework,frameworkLabel:selected.label});
        break;
      }
"""+text[stop:]
old="""          if(!Object.hasOwn(UX_FRAMEWORKS,designFramework)||designFramework!==String(msg.framework||''))throw Error('Selected design framework changed. Reload the ticket and retry.');
          const workspace=getWorkspace()?.uri.fsPath;
          const baseGuide=designFramework==='aia-qi'?await sdlcCatalog.designReference(workspace,'aia-qi'):'';
          const componentsGuide=designFramework==='aia-qi'?await sdlcCatalog.designComponentsReference(workspace,'aia-qi'):'';
          const guide=(baseGuide+'\\n'+componentsGuide)+'\\nSelected UI/UX framework: '+UX_FRAMEWORKS[designFramework]+'. '+(designFramework==='bootstrap-5.3'?'Follow Bootstrap v5.3 responsive layout, grid, components and accessibility patterns. Do not use AIA Qi components or tokens for this framework.':'Use only approved version-pinned GitHub catalog guidance, tokens and component inventory. This independent Qi-inspired kit is not the official AIA Qi framework; do not claim brand approval.');"""
new="""          const workspace=getWorkspace()?.uri.fsPath;
          const availableFrameworks=await sdlcCatalog.designFrameworks(workspace);
          const selectedFramework=availableFrameworks.find(item=>item.id===designFramework);
          if(!selectedFramework||designFramework!==String(msg.framework||''))throw Error('Selected framework is not active or has changed. Pull Catalog, reload the ticket and retry.');
          const [baseGuide,componentsGuide]=await Promise.all([
            sdlcCatalog.designReference(workspace,designFramework),
            sdlcCatalog.designComponentsReference(workspace,designFramework)
          ]);
          const guide=baseGuide+'\\n'+componentsGuide+'\\nSelected UI/UX framework: '+selectedFramework.label+' ('+designFramework+', kit '+selectedFramework.kitVersion+'). Use only the approved version-pinned GitHub catalog design system. Do not mix in any other design-system classes, tokens or runtime assets.'+(designFramework==='aia-qi'?' This is an independent Qi-inspired kit, not official AIA Qi.':'');"""
assert old in text,'AI guide block not found';text=text.replace(old,new)
# Host server status reconciliation for currently saved tested SHA, keep server health gating
old="""        if(project?.techStackPrepared?.stackId===project.techStackId){
          try{state=await require('./architect-server').status({root:project.techStackPrepared.root,stackId:project.techStackId});}
          catch(error){state={running:false,message:'Server unavailable: '+error.message};}
        }
        await dashboard?.webview.postMessage({type:'architectServerStatus',projectId:activeProject.id,value:state});break;"""
new="""        if(project?.techStackPrepared?.stackId===project.techStackId){
          try{
            state=await require('./architect-server').status({root:project.techStackPrepared.root,stackId:project.techStackId});
            if(state.running&&state.url){
              try{
                // Require an ATGV-owned process AND a successful HTTP check.
                await require('./architect-stack-bootstrap').waitForHttp(state.url,()=>developerGit.localLogs().running,3500);
                state.healthy=true;
                const proof=require('./architect-server-verification').evidenceIfHealthy(project,state);
                if(proof&&!require('./architect-stack-approval').serverVerified(project)){
                  activeProject=await registry.update(activeProject.id,{...project,techStackServerVerification:proof});
                  await refreshDashboard();
                }
              }catch(healthError){state.healthy=false;state.message='App server started but health check failed: '+healthError.message;}
            }
          }catch(error){state={running:false,healthy:false,message:'Server unavailable: '+error.message};}
        }
        await dashboard?.webview.postMessage({type:'architectServerStatus',projectId:activeProject.id,value:state});break;"""
assert old in text;text=text.replace(old,new)
text=text.replace("if(!serverState.running)throw Error('Run Server must be running successfully for this approved stack revision before Developer approval.');","if(!serverState.running)throw Error('Run Server must be running successfully for this approved stack revision before Developer approval.');\n        await require('./architect-stack-bootstrap').waitForHttp(serverState.url,()=>developerGit.localLogs().running,3500);\n        const healthyProof=require('./architect-server-verification').evidenceIfHealthy(project,{...serverState,healthy:true});\n        if(!healthyProof)throw Error('The running application does not match the tested and saved stack commit. Re-run Test & Run, then Run Server.');")
p.write_text(text)
# Media updates, frontend catalogue-driven dropdown and health proof readiness
p=root/'media/start.js';text=p.read_text()
text=text.replace("&&architectServerSnapshot.running===true&&architectServerSnapshotProjectId===activeId],","&&architectServerSnapshot.running===true&&architectServerSnapshot.healthy===true&&architectServerSnapshotProjectId===activeId],",1)
text=text.replace("&&architectServerSnapshot.running===true&&architectServerSnapshotProjectId===activeId);","&&architectServerSnapshot.running===true&&architectServerSnapshot.healthy===true&&architectServerSnapshotProjectId===activeId);",1)
text=text.replace("let uxSelectedKey='',uxDrafts={wireframe:null,mockup:null},uxPipeline=null,uxPipelineBusy=false,uxPipelineStage=0,uxPendingOpenKey='',uxReferenceAvailable=false,uxPipelineStopping=false,uxCanStop=true,uxFramework='aia-qi';","let uxSelectedKey='',uxDrafts={wireframe:null,mockup:null},uxPipeline=null,uxPipelineBusy=false,uxPipelineStage=0,uxPendingOpenKey='',uxReferenceAvailable=false,uxPipelineStopping=false,uxCanStop=true,uxFramework='',uxFrameworks=[];")
old="""function updateUxFrameworkDocs(){
 const framework=$('uxDesignFramework').value==='bootstrap-5.3'?'Bootstrap v5.3':'AIA QI';
 const button=$('uxFrameworkDocs');
 button.setAttribute('aria-label','Open '+framework+' component documentation in browser');
 button.title='Open '+framework+' components in a new browser tab';
}"""
new="""function updateUxFrameworkDocs(){
 const selected=uxFrameworks.find(item=>item.id===$('uxDesignFramework').value);
 const button=$('uxFrameworkDocs');
 button.disabled=!selected;
 button.setAttribute('aria-label','Open '+(selected?.label||'selected framework')+' components from SDLC Catalog');
 button.title=selected?'Open '+selected.label+' catalogue in a new VS Code tab':'Pull and activate the SDLC Catalog to view frameworks';
}
function renderUxFrameworkOptions(frameworks,selected){
 const picker=$('uxDesignFramework');
 uxFrameworks=Array.isArray(frameworks)?frameworks.filter(item=>item&&/^[a-z][a-z0-9-]{0,48}$/.test(item.id)&&typeof item.label==='string').slice(0,30):[];
 picker.replaceChildren();
 if(!uxFrameworks.length){const option=document.createElement('option');option.value='';option.textContent='Pull Catalog for design frameworks';picker.append(option);}
 for(const item of uxFrameworks){const option=document.createElement('option');option.value=item.id;option.textContent=item.label;picker.append(option);}
 uxFramework=uxFrameworks.some(item=>item.id===selected)?selected:uxFrameworks[0]?.id||'';
 picker.value=uxFramework;
 updateUxFrameworkDocs();
}"""
assert old in text;text=text.replace(old,new)
text=text.replace("button.disabled=!uxSelectedKey||(uxPipelineBusy&&(!uxCanStop||uxPipelineStopping));","button.disabled=!uxSelectedKey||(!uxReadyForPreview()&&!uxFramework)||(uxPipelineBusy&&(!uxCanStop||uxPipelineStopping));")
text=text.replace("$('uxDesignFramework').value='aia-qi';","$('uxDesignFramework').value='';")
text=text.replace("uxFramework='aia-qi';$('uxDesignFramework').value=uxFramework;","uxFramework='';$('uxDesignFramework').value=uxFramework;")
text=text.replace("if(m.type==='uxFrameworkLoaded'&&m.key===uxSelectedKey){uxFramework=m.value; $('uxDesignFramework').value=uxFramework;renderUxActions();}","if(m.type==='uxFrameworkLoaded'&&m.key===uxSelectedKey){renderUxFrameworkOptions(m.frameworks,m.value);renderUxActions();if(!uxFramework)setUxStatus('No activated design framework. Pull and activate the SDLC Catalog in Settings.');}")
text=text.replace("if(m.type==='catalogState')renderCatalog(m.catalog);","if(m.type==='catalogState'){const previous=catalogState?.installed?.sha;renderCatalog(m.catalog);if(uxSelectedKey&&m.catalog?.installed?.sha!==previous)send('uxFrameworkRead',{key:uxSelectedKey});}")
p.write_text(text)
# version
p=root/'package.json';meta=json.loads(p.read_text());meta['version']='0.2.38';meta['atgvDisplayVersion']='0.2.38';p.write_text(json.dumps(meta,indent=2)+'\n')
(root/'RELEASE.md').write_text('''# ATGV AIATECH Assist v0.2.38 — Design frameworks and healthy server approval

- UI/UX framework dropdown now lists available activated GitHub catalogue designs dynamically. Both AIA Qi and Bootstrap v5.3 use the same offline read-only component showcase.
- AI generation uses only the chosen framework guidance, token file, and component catalogue from the verified GitHub SHA. Selecting Bootstrap no longer relies on generic hardcoded instructions or external documentation.
- The GitHub `tech-stacks-skills` update is v1.1.2, which adds Bootstrap 5.3.6 CSS/JS and a 39-entry component catalogue alongside the AIA Qi kit.
- Solution Architect server readiness and approval require both an ATGV-owned running server and a successful HTTP health check for the saved/tested commit.
- Reconciles a missing server verification record after confirming the process, health, saved branch/commit and successful Test & Run evidence. Does not waive the approval gate or approve wrong revisions.

Installation: Publish `tech-stacks-skills v1.1.2` to main; install this VSIX; Pull Catalog and activate it. Live VS Code and external GitHub/Jira operations require user testing.
''')
print('Updated source',root)
