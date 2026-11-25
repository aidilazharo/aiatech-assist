'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const workspace=require('../src/repo-sync-workspace');
test('one Workspace page provides two independent sets of form IDs',()=>{
 const html=workspace.workspaceHtml({nonce:'dual',version:'0.1.6',cspSource:'vscode-resource:'});
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const id of ['sourceSavedRepos','destinationSavedRepos','selectRepoB','destinationLabel','reviewPanel','publishReviewed']){assert.ok(ids.includes(id));assert.ok(ids.includes('library-'+id));}
 assert.doesNotThrow(()=>new Function(html.match(/<script nonce="dual">([\s\S]*?)<\/script>/)[1]));
 assert.equal(workspace.profileKey('saved','extension'),'saved');
 assert.equal(workspace.profileKey('saved','library'),'saved.library');
});
test('only a clean managed checkout with a successful matching PR is cleared',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'atgv-dual-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const checkout=await workspace.managedCheckout(root);
 await fs.mkdir(path.join(checkout.dir,'.git'));
 const outcome={prUrl:'https://github.com/Acme/repo/pull/1',destinationRepo:'Acme/repo',branch:'fix/example'};
 const git=async args=>args[0]==='rev-parse'?checkout.dir:args[0]==='symbolic-ref'?outcome.branch:'';
 assert.equal(await workspace.cleanManagedCheckout(checkout,{}, {git}),false);
 await assert.rejects(workspace.cleanManagedCheckout(checkout,{...outcome,prUrl:'https://github.com/Other/repo/pull/1'},{git}),/PR identity/);
 await assert.rejects(workspace.cleanManagedCheckout(checkout,outcome,{git:async args=>args[0]==='status'?'?? user-file':git(args)}),/unexpected changes/);
 assert.equal(await workspace.cleanManagedCheckout(checkout,outcome,{git}),true);
 assert.deepEqual(await fs.readdir(root),[]);
 await fs.writeFile(path.join(root,'user.txt'),'keep');
 assert.equal(await workspace.managedCheckout(root),null);
 assert.equal(await fs.readFile(path.join(root,'user.txt'),'utf8'),'keep');
});
