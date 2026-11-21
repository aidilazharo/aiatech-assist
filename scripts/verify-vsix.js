'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const {python} = require('./python-runtime');
async function main() {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    const source = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', `${pkg.name}-${pkg.version}.vsix`));
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atgv-vsix-activation-'));
    try {
        const extract = python(['-c',
            'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', source, temp], { encoding: 'utf8' });
        assert.equal(extract.status, 0, extract.stderr || 'Failed to extract VSIX');
        const root = path.join(temp, 'extension');
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        assert.ok(!fs.existsSync(path.join(root,'.memory')), 'Source-only .memory must not be included in VSIX');
        const runtimePolicy=require(path.join(root,'src','version-policy.js'));
        assert.equal(runtimePolicy.nextVersion('0.0.1'),'0.0.2','Runtime version-policy must not depend on excluded .memory');
        const runtimeMemory=require(path.join(root,'src','decision-memory.js'));
        assert.equal(runtimeMemory.memoryForPrompt('versioning release'),'', 'Installed runtime must tolerate excluded source-only .memory');
        // SortableJS is provided only by the SHA-256-pinned SDLC Library.
        const lock=JSON.parse(fs.readFileSync(path.join(root,'src','vendor-library-lock.json'),'utf8'));
        assert.equal(lock.version,'1.0.1');
        const sortable=lock.assets.find(a=>a.path==='sortablejs/sortablejs-1.15.7.min.js');
        assert.ok(sortable&&sortable.bytes===45478&&sortable.sha256==='bf4241bc73fef7f11c59a283a69fe8051cdd31c6d8ff5a2b9ba219e7831fcf76');
        for(const name of ['sortablejs-1.15.7.min.js','sortablejs-LICENSE.txt','SORTABLEJS-NOTICE.md'])
            assert.ok(!fs.existsSync(path.join(root,'media','vendor',name)),name+' must not be packaged in the extension VSIX');
        const dashboardHtml=fs.readFileSync(path.join(root,'src','lib','webview','dashboard-html.js'),'utf8');
        const vendorLoader='vendor(\'sortablejs\',\'sortablejs-1.15.7.min.js\')';
        const boardLoader='<script src="${pmKanbanJs}"></script>';
        assert.ok(dashboardHtml.includes(vendorLoader),'SortableJS must resolve from the verified Library cache');
        assert.ok(dashboardHtml.includes('${sortableJs?')&&dashboardHtml.indexOf('sortableJs?')<dashboardHtml.indexOf(boardLoader));
        assert.ok(!dashboardHtml.includes("'media','vendor','sortablejs-1.15.7.min.js'"));

        const packageXml = fs.readFileSync(path.join(temp, 'extension.vsixmanifest'), 'utf8');
        assert.ok(packageXml.includes('Version="' + manifest.version + '"'));
        assert.ok(packageXml.includes('Microsoft.VisualStudio.Code.Details'));
        assert.ok(packageXml.includes('Path="extension/README.md"'));
        assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8').trim(), `**Version: ${manifest.atgvDisplayVersion}**\n\n**Author:** [Muhamad Aidil Azhar Salim](mailto:muhamadaidilazhar.salim@aia.com)`);
        assert.ok(!fs.existsSync(path.join(root, 'CHANGELOG.md')));
        assert.equal(manifest.atgvDisplayVersion, manifest.version);
        const expected = ['atgvAssist.ai', 'atgvAssist.refreshUnifiedArtifacts', 'atgvAssist.reportIssue', 'atgvAssist.reset', 'atgvAssist.restart', 'atgvAssist.start', 'atgvAssist.workspace'];
        assert.deepEqual(manifest.contributes.commands.map(c => c.command).sort(), expected);
        const commands = new Map(), registered = [];
        const noop = () => ({ dispose() { } });
        const stub = {
            window: { createOutputChannel() { return { appendLine() { }, dispose() { } }; },
                async showInformationMessage() { return undefined; }, async showErrorMessage() { return undefined; } },
            commands: { registerCommand(id, fn) { commands.set(id, fn); registered.push(id); return noop(); },
                async executeCommand(id, ...args) { if (commands.has(id))
                    return commands.get(id)(...args); throw Error('Command not registered: ' + id); } },
            workspace: { workspaceFolders: [], getConfiguration() { return { get: (_key, defaultValue) => defaultValue }; },
                onDidChangeWorkspaceFolders: noop },
            Uri: { file: location => ({ fsPath: location }), joinPath: (root, ...segments) => ({ fsPath: path.join(root.fsPath, ...segments) }) }
        };
        const originalLoad = Module._load;
        let ext;
        try {
            Module._load = function (request, parent, isMain) {
                return request === 'vscode' ? stub : originalLoad.call(this, request, parent, isMain);
            };
            ext = require(path.join(root, manifest.main));
            assert.equal(typeof ext.activate, 'function');
            assert.equal(typeof ext.deactivate, 'function');
            const values = new Map();
            const ctx = { extensionUri: { fsPath: root }, globalStorageUri: { fsPath: path.join(temp, 'store') },
                globalState: { get: (k, d) => values.get(k) ?? d, update: async (k, v) => values.set(k, v) },
                workspaceState: { get: () => undefined, update: async () => { } },
                secrets: { get: async () => undefined, store: async () => { }, delete: async () => { } }, subscriptions: [] };
            ext.activate(ctx);
            assert.deepEqual([...commands.keys()].sort(), expected);
            assert.deepEqual(registered.sort(), expected);
            await new Promise(resolve => setImmediate(resolve));
        }
        finally {
            Module._load = originalLoad;
        }
        console.log('VSIX verification passed:', manifest.version, '— runtime loaded and Start / Restart / Reset / Refresh Shared Artifacts registered.');
    }
    finally {
        fs.rmSync(temp, { force: true, recursive: true });
    }
}
main().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
