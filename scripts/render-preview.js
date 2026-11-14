'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'search';
const Module=require('node:module');
const vscode = { Uri: { joinPath: (_uri, ...parts) => parts.join('/'), file: filename => filename } };
const originalLoad=Module._load;
let createDashboardHtml;
try {
    Module._load=function(request,parent,isMain){return request==='vscode'?vscode:originalLoad.call(this,request,parent,isMain);};
    ({createDashboardHtml}=require('../src/lib/webview/dashboard-html'));
} finally { Module._load=originalLoad; }
const html=createDashboardHtml(()=>({extensionUri:{fsPath:root}}),()=>null);
let markup = html({ asWebviewUri: u => u, cspSource: 'file:' });
markup = markup.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '');
const { ROLES } = require('../src/sdlc-work');
const progress = {
    'business-analyst': { discovery: true, requirements: true },
    'project-manager': { plan: true }, 'solution-architect': { architecture: true },
    'software-developer': { design: true }, 'qa-engineer': { cases: true }, 'release-manager': {}
};
const files = {};
for (const r of ROLES) {
    files[r.id] = {};
    for (const t of r.tasks)
        files[r.id][t.id] = !!progress[r.id]?.[t.id];
}
const state = { modelStatus: { name: 'GPT-4.1', state: 'ready', message: 'Online / ready' }, coordinationProvider: 'jira-confluence', recentProjects: ['cockpit-sdlc'], projectReadiness: { 'cockpit-sdlc': true, 'software-development': false }, openingOffline: false, type: 'state', discovery: { answers: { problem: 'Improve claims process', scope: 'Online claims', acceptance: 'Upload succeeds' }, revision: 'test-preview', readiness: { filled: 3, total: 12 } }, flow: { ready: 1, blocked: 4, tasks: [{ id: 'planning', name: 'Project planning draft', ready: true }, { id: 'architecture', name: 'Architecture proposal', ready: false, blockedBy: 'Missing integration details' }] }, activeId: mode === 'open' ? 'cockpit-sdlc' : null, projects: [
        { id: 'cockpit-sdlc', name: 'COCKPIT SDLC', techStackId: 'react', settings: { jira: { projectKey: 'CSDLC' }, confluence: { spaceId: '3375232', spaceKey: 'CSDLC', spaceName: 'COCKPIT SDLC', baseUrl: 'https://example.atlassian.net/wiki' }, github: {} } },
        { id: 'software-development', name: 'Software Development', settings: { jira: { projectKey: 'SD' }, confluence: { spaceId: '131183', spaceKey: 'SD', spaceName: 'Software Development' } } }
    ],
    summary: { documents: 18, chunks: 245 }, workspace: '/workspace/app-test', version: require('../package.json').atgvDisplayVersion, jiraTokenSaved: true, githubTokenSaved: false,
    extensionSettings: { jira: { baseUrl: 'https://example.atlassian.net', email: 'developer@example.org' }, github: {} }, work: { roles: ROLES, progress, files },
    techStacks: []
};
state.roleSettings = { roles: ROLES.map(r => ({ id: r.id, label: r.label, stage: r.stage, enabled: true })), enabled: ROLES.map(r => r.id), revision: 'preview-revision' };
const today = new Date('2026-10-26T00:00:00Z');
const addDays = (n) => { const dt = new Date(today); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
state.timeline = { tasks: ROLES.map((r, i) => ({ id: r.id, name: r.label, start: addDays(i * 7), end: addDays(i * 7 + 6), progress: Math.min(100, i * 10), dependencies: '' })), revision: 'preview-timeline' };
state.opening = { phase: mode === 'open' ? 'open' : mode === 'selected' ? 'selected' : mode === 'tested' ? 'tested' : mode === 'initialized' ? 'initialized' : 'search', candidate: ['selected', 'tested', 'initialized', 'open'].includes(mode) ? { id: 'cockpit-sdlc', name: 'COCKPIT SDLC', settings: { jira: { projectKey: 'CSDLC' }, confluence: { spaceId: '3375232', spaceKey: 'CSDLC', spaceName: 'COCKPIT SDLC', baseUrl: 'https://example.atlassian.net/wiki' }, github: {} } } : null, warnings: [] };
const shim = `<script>window.acquireVsCodeApi=()=>({postMessage:message=>{window.__atgvSent=message;}});window.addEventListener('load',()=>{window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(state)}}));});</script>`;
const css = fs.readFileSync(path.join(root, 'media', 'start.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'media', 'start.js'), 'utf8');
const logo = fs.readFileSync(path.join(root, 'media', 'atgv-mark.png')).toString('base64');
const theme = `:root{--vscode-font-family:Inter,Arial,sans-serif;--vscode-editor-background:#191b20;--vscode-editor-foreground:#e5e8ee;--vscode-foreground:#dfe3ec;--vscode-descriptionForeground:#9ba3b5;--vscode-panel-border:#343943;--vscode-input-background:#33363e;--vscode-input-foreground:#e5e8ee;--vscode-button-background:#1264bb;--vscode-button-foreground:#fff;--vscode-button-hoverBackground:#1c79d7;--vscode-button-secondaryBackground:#2c313b;--vscode-button-secondaryForeground:#e5e8ef;--vscode-button-secondaryHoverBackground:#454e5c;--vscode-titleBar-activeBackground:#11151c;--vscode-sideBar-background:#181d25;--vscode-editorWidget-background:#242832;--vscode-list-hoverBackground:#303c4e;--vscode-list-activeSelectionBackground:#17365d;--vscode-list-activeSelectionForeground:#c5e1ff;--vscode-focusBorder:#518de6;--vscode-testing-iconPassed:#76caaa;--vscode-errorForeground:#ef8b91;}`;
markup = markup.replace(/<link rel="stylesheet" href="media\/start\.css">/, `<style>${theme + css}</style>`);
markup = markup.replaceAll('src="media/atgv-mark.png"', `src="data:image/png;base64,${logo}"`);
markup = markup.replace('<script src="media/diagram-canvas.js"></script>', '<script>' + fs.readFileSync(path.join(root, 'media', 'diagram-canvas.js'), 'utf8') + '</script>');
for (const name of ['ownership-filters.js', 'ownership-presentation.js'])
    markup = markup.replace('<script src="media/' + name + '"></script>', '<script>' + fs.readFileSync(path.join(root, 'media', name), 'utf8') + '</script>');
markup = markup.replace('<script src="media/start.js"></script>', shim + '<script>' + js + '</script>');
fs.writeFileSync(path.join(root, 'preview-' + mode + '.html'), markup);
console.log('Preview:', path.join(root, 'preview-' + mode + '.html'));
