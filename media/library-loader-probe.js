'use strict';
// Read-only webview diagnostics: learn whether locally approved script resources
// fail to load. Do not import or execute any remote code here.
(() => {
 const failures=[];
 window.atgvLibraryAssetFailures=failures;
 window.addEventListener('error',event=>{
  const node=event.target;
  if(!node||!['SCRIPT','LINK'].includes(node.tagName))return;
  const url=String(node.src||node.href||'');
  if(!/(?:codemirror|quill|frappe-gantt)/i.test(url))return;
  // Do not send full local paths / auth tokens through error notifications.
  const filename=url.split(/[/?#]/).filter(Boolean).at(-1)||'library-asset';
  if(failures.length<20)failures.push('Unable to load '+filename);
 },true);
})();
