'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(dir,'test/generated/extension-source.txt'),'utf8');
const webview=fs.readFileSync(path.join(dir,'media/start.js'),'utf8');
const css=fs.readFileSync(path.join(dir,'media/start.css'),'utf8');
class Element {
 constructor(){this.children=[];this.dataset={};this.style={};this.attrs={};this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};this.value='';this.textContent='';}
 replaceChildren(...children){this.children=children;}
 append(...children){this.children.push(...children);}
 setAttribute(key,value){this.attrs[key]=value;}
}
function harness(){
 const ids=['architectStackSelect','architectRequiredComponents','architectRequirementsList','architectRequirementsTitle','architectRequirementsCount','architectStackProgressFill','architectStackProgress','architectStackProgressText'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const source=webview.slice(webview.indexOf('let architectLastMessage='),webview.indexOf('let roleJiraProject='));
 assert.ok(source.includes('function renderArchitectRequirements'));
 const react={id:'react',name:'ReactJS',runtime:'React 19',buildTool:'Vite',runCommand:'npm run dev',buildCommand:'npm run build',apiBaseUrl:'http://127.0.0.1:3001',orm:'Drizzle ORM',database:'SQLite',unit:['Vitest'],previewUrl:'http://127.0.0.1:5173'};
 const spring={id:'spring-boot',name:'Java Spring Boot',runtime:'Java 25',buildTool:'Maven',runCommand:'mvn spring-boot:run',buildCommand:'mvn package',apiBaseUrl:'http://127.0.0.1:8080',orm:'Spring Data JPA / Hibernate',database:'SQLite',unit:['JUnit 5'],previewUrl:'http://127.0.0.1:8080'};
 const context=vm.createContext({activeId:'p',techStacks:[react,spring],projects:[],architectServerSnapshot:{running:false,healthy:false},architectServerSnapshotProjectId:'',document:{createElement:()=>new Element()},$:id=>elements[id]});
 vm.runInContext(source,context);
 return {context,elements};
}
test('Requirements appear on stack selection and display metadata from remote catalog',()=>{
 const {context,elements}=harness();
 elements.architectStackSelect.value='react';
 vm.runInContext('renderArchitectRequirements(null)',context);
 assert.match(elements.architectRequirementsTitle.textContent,/ReactJS/);
 assert.equal(elements.architectRequirementsList.children.length,12);
 const strings=elements.architectRequirementsList.children.map(c=>c.children[1].children.map(x=>x.textContent).join(' '));
 assert.ok(strings.some(s=>s.includes('Drizzle ORM')));
 assert.ok(strings.some(s=>s.includes('SQLite')));
 assert.ok(strings.some(s=>s.includes('http://127.0.0.1:3001')));
 assert.equal(elements.architectRequirementsCount.textContent,'1 of 12 ready');
 assert.equal(elements.architectStackProgress.attrs['aria-valuenow'],'8');
 elements.architectStackSelect.value='spring-boot';
 vm.runInContext('renderArchitectRequirements(null)',context);
 const updated=elements.architectRequirementsList.children.map(c=>c.children[1].children.map(x=>x.textContent).join(' '));
 assert.ok(updated.some(s=>s.includes('Spring Data JPA / Hibernate')));
 assert.ok(updated.some(s=>s.includes('mvn spring-boot:run')));
 assert.ok(!updated.some(s=>s.includes('Drizzle ORM')));
});
test('Progress tracks live dependency checks and persisted validated project state',()=>{
 const {context,elements}=harness();
 elements.architectStackSelect.value='react';
 vm.runInContext("architectChecklistAdvance('Installing npm dependencies (missing: express)…')",context);
 const find=title=>elements.architectRequirementsList.children.find(x=>x.children[1].children[0].textContent===title);
 assert.equal(find('Dependencies').dataset.state,'running');
 const project={techStackId:'react',techStackPrepared:{stackId:'react',remotePushed:true},techStackValidation:{status:'tested',stackId:'react'},techStackApproval:{status:'approved',stackId:'react'}};
 context.projects=[{...project,id:'p'}];
 vm.runInContext('renderArchitectRequirements(projects[0])',context);
 assert.equal(elements.architectRequirementsCount.textContent,'11 of 12 ready'); // Server requires explicit Run Server verification
 assert.equal(elements.architectStackProgress.attrs['aria-valuenow'],'92');
 assert.equal(find('Dependencies').dataset.state,'complete');
});
test('Missing catalog API, ORM or database remains visibly incomplete even after other checks pass',()=>{
 const {context,elements}=harness();
 elements.architectStackSelect.value='react';
 vm.runInContext("techStacks[0].orm='';renderArchitectRequirements({techStackId:'react',techStackPrepared:{stackId:'react',remotePushed:true},techStackValidation:{status:'tested',stackId:'react'},techStackApproval:{status:'approved',stackId:'react'}})",context);
 const item=elements.architectRequirementsList.children.find(x=>x.children[1].children[0].textContent==='ORM');
 assert.equal(item.dataset.state,'failure');
 assert.equal(item.children[2].textContent,'Not defined');
 assert.equal(elements.architectRequirementsCount.textContent,'10 of 12 ready');
});
test('Application server requires successful run status, then counts toward readiness',()=>{
 const {context,elements}=harness();
 elements.architectStackSelect.value='react';
 const prepared={stackId:'react',root:'/tmp/stack',branch:'bootstrap/react-initial',sha:'a'.repeat(40),remotePushed:false};
 const proof={status:'verified',stackId:'react',root:prepared.root,branch:prepared.branch,sha:prepared.sha,at:'2026-11-06T00:00:00Z'};
 context.architectServerSnapshot={running:true,healthy:true,sha:prepared.sha,branch:prepared.branch};context.architectServerSnapshotProjectId='p';
 const project={techStackId:'react',techStackPrepared:prepared,techStackValidation:{status:'tested',stackId:'react'},techStackApproval:{status:'approved',stackId:'react'},techStackServerVerification:proof};
 vm.runInContext('renderArchitectRequirements(project)',vm.createContext({...context,project}));
 assert.equal(elements.architectRequirementsCount.textContent,'12 of 12 ready');
 assert.equal(elements.architectStackProgress.attrs['aria-valuenow'],'100');
});
test('Remote scaffold package list expands into per-package progress items',()=>{
 const {context,elements}=harness();
 elements.architectStackSelect.value='react';
 vm.runInContext("techStacks[0].dependencyPackages=[{name:'express',version:'^4.21',manager:'npm',scope:'runtime'},{name:'drizzle-orm',version:'^0.44',manager:'npm',scope:'runtime'}];renderArchitectRequirements(null)",context);
 assert.equal(elements.architectRequirementsList.children.length,14);
 assert.equal(elements.architectRequirementsCount.textContent,'1 of 14 ready');
 const pkg=elements.architectRequirementsList.children.find(x=>x.children[1].children[0].textContent==='npm · express');
 assert.equal(pkg.children[2].textContent,'Pending');
 vm.runInContext("architectChecklistAdvance('Installing npm dependencies…')",context);
 assert.equal(elements.architectRequirementsList.children.find(x=>x.children[1].children[0].textContent==='npm · express').dataset.state,'running');
});
test('Extracts dependency items from remote npm, NuGet, and Maven manifests only',()=>{
 const {catalogDependencyPackages}=require('../src/tech-stacks');
 const files={
  'package.json':Buffer.from(JSON.stringify({dependencies:{express:'^4', 'drizzle-orm':'^0.44'},devDependencies:{vite:'^7'}})),
  'Api.csproj':Buffer.from('<Project><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="10.0.0" /></ItemGroup></Project>'),
  'pom.xml':Buffer.from('<project><dependencies><dependency><groupId>org.xerial</groupId><artifactId>sqlite-jdbc</artifactId><version>3.49.1</version></dependency></dependencies></project>')
 };
 const packages=catalogDependencyPackages(files);
 assert.deepEqual(packages.map(x=>x.name),['express','drizzle-orm','vite','Microsoft.EntityFrameworkCore.Sqlite','org.xerial:sqlite-jdbc']);
 assert.deepEqual(packages.map(x=>x.manager),['npm','npm','npm','nuget','maven']);
});
test('Checklist uses one existing readiness progress bar and live event wiring',()=>{
 assert.match(html,/id="architectRequiredComponents"/);
 assert.match(html,/id="architectRequirementsList"[^>]*role="list"/);
 assert.match(webview,/architectStackSelect'\)\.addEventListener\('change',[\s\S]*?renderArchitectRequirements\(project\)/);
 assert.match(webview,/if\(msg\.type==='architectStackProgress'[\s\S]*?architectChecklistAdvance/);
 assert.match(css,/\.architect-requirement-list/);
 assert.equal((html.match(/id="architectStackProgress"/g)||[]).length,1);
});
