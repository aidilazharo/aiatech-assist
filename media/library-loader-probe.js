'use strict';
// Initialize before stylesheet and vendor script tags, so fresh installations
// capture failures instead of checking only after the assets have loaded.
(() => {
  const failures=[];
  window.atgvLibraryAssetFailures=failures;
  window.atgvCoreAssetFailures=[];
  window.addEventListener('error',event=>{
    const node=event.target;
    if(!node||!['SCRIPT','LINK'].includes(node.tagName))return;
    const url=String(node.src||node.href||'');
    if(!url)return;
    const filename=url.split(/[/?#]/).filter(Boolean).at(-1)||'resource';
    if(/(?:codemirror|quill|frappe-gantt|sortablejs-1\.15\.7\.min\.js)/i.test(url)&&failures.length<20)
      failures.push('Unable to load '+filename);
    if(/(?:start\.css|atgv-ui-theme\.css|library-studio\.css|ai-change-resolution\.css|start\.js|atgv-kanban\.js)/i.test(url)&&window.atgvCoreAssetFailures.length<20)
      window.atgvCoreAssetFailures.push('Unable to load '+filename);
  },true);
})();
