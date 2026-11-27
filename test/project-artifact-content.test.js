'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const content=require('../src/project-artifact-content');
test('actual project content copies separate uploads from generated mockups and interactive HTML',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'atgv-content-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const files={'documents/requirements/sources/original.pdf':Buffer.from('%PDF-original'),'documents/jira-designs/TC-1/image-abc.png':Buffer.from('image bytes'),'documents/jira-designs/TC-1/mockup-r1-screen-01.svg':Buffer.from('<svg/>'),'documents/project-prototype/index.html':Buffer.from('<html>Interactive</html>'),'documents/development/technical-design.md':Buffer.from('design'),'documents/credentials.json':Buffer.from('secret')};
 for(const [name,bytes] of Object.entries(files)){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
 const m=await content.refresh(root);assert.equal(m.files.length,5);
 for(const f of m.files){const bytes=await fs.readFile(path.join(root,'artifacts',f.path));assert.deepEqual(bytes,files[f.source]);assert.equal(f.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));}
 assert.equal(m.files.filter(f=>f.kind==='reference').length,2);assert.equal(m.files.filter(f=>f.kind==='generated').length,3);
 await fs.rm(path.join(root,'documents/jira-designs/TC-1/image-abc.png'));
 const next=await content.refresh(root);assert.equal(next.files.length,4);
 assert.equal(next.files.some(f=>f.source.endsWith('image-abc.png')),false);
});
test('unrelated repository and credential files are not indexed',()=>{assert.equal(content.classify('documents/requirements/sources/a.pdf').kind,'reference');assert.equal(content.classify('documents/project-prototype/index.html').role,'ux-designer');});
