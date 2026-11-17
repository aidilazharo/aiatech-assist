'use strict';
// Last script in the document: only signal readiness when the DOM, stylesheet
// links and controller scripts have had an opportunity to load.
(() => {
  let sent=false;
  function ready(){
    if(sent)return;
    sent=true;
    const required=['start.css','atgv-ui-theme.css','library-studio.css','ai-change-resolution.css'];
    const styles=[...document.querySelectorAll('link[rel="stylesheet"]')];
    const missing=required.filter(name=>!styles.some(link=>
      link.href.split(/[?#]/)[0].endsWith('/'+name)&&!!link.sheet));
    const failures=[...new Set([
      ...(window.atgvCoreAssetFailures||[]),
      ...missing.map(name=>'Missing stylesheet '+name),
      ...(!window.Sortable||typeof window.Sortable.create!=='function'?['Bundled SortableJS could not initialize']:[]),
      ...(!window.ATGVKanban||typeof window.ATGVKanban.render!=='function'?['ATGV Kanban controller could not initialize']:[])
    ])].slice(0,20);
    if(failures.length){
      const banner=document.createElement('div');
      banner.setAttribute('role','alert');
      banner.textContent='ATGV interface assets could not load. Reload the VS Code window. Details are in ATGV Output: '+failures.join('; ');
      banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#6b1b1b;color:white;padding:12px;font:14px system-ui;';
      document.body.prepend(banner);
    }
    try {
      vscode.postMessage({command:'webviewReady',coreStylesLoaded:failures.length===0,loadErrors:failures});
    }catch(error){console.error('ATGV webview readiness notification failed',error);}
  }
  if(document.readyState==='complete')ready();
  else window.addEventListener('load',ready,{once:true});
})();
