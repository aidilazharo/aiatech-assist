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
        // The official SortableJS release is shipped inside the VSIX; no user npm
        // install, CDN request, or external runtime download is permitted.
        const sortablePath = path.join(root, 'media', 'vendor', 'sortablejs-1.15.7.min.js');
        const sortableBytes = fs.readFileSync(sortablePath);
        assert.equal(sortableBytes.length, 45478, 'Bundled SortableJS must exactly match the pinned release');
        assert.match(sortableBytes.toString('utf8', 0, 110), /Sortable 1\.15\.7 - MIT/);
        const gitBlobSha = crypto.createHash('sha1')
            .update('blob ' + sortableBytes.length + '\\0')
            .update(sortableBytes)
            .digest('hex');
        assert.equal(gitBlobSha, '8148b9dda22424c300191fcd3fcff1648de41e2e', 'SortableJS must be the original tagged GitHub distribution');
        assert.match(fs.readFileSync(path.join(root, 'media', 'vendor', 'sortablejs-LICENSE.txt'), 'utf8'), /MIT License/);
        assert.ok(fs.existsSync(path.join(root, 'media', 'vendor', 'SORTABLEJS-NOTICE.md')));
        const dashboardHtml = fs.readFileSync(path.join(root, 'src', 'lib', 'webview', 'dashboard-html.js'), 'utf8');
        const vendorLoader = '<script src="${sortableJs}"></script>';
        const boardLoader = '<script src="${pmKanbanJs}"></script>';
        assert.ok(dashboardHtml.includes('sortablejs-1.15.7.min.js'), 'Local SortableJS URI is required');
        assert.ok(dashboardHtml.indexOf(vendorLoader) >= 0 && dashboardHtml.indexOf(vendorLoader) < dashboardHtml.indexOf(boardLoader), 'SortableJS must load before Kanban');

        const packageXml = fs.readFileSync(path.join(temp, 'extension.vsixmanifest'), 'utf8');
        assert.ok(packageXml.includes('Version="' + manifest.version + '"'));
        assert.ok(packageXml.includes('Microsoft.VisualStudio.Code.Details'));
        assert.ok(packageXml.includes('Path="extension/README.md"'));
        assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8').trim(), `**Version: ${manifest.atgvDisplayVersion}**\n\n**Author:** [Muhamad Aidil Azhar Salim](mailto:muhamadaidilazhar.salim@aia.com)`);
        assert.ok(!fs.existsSync(path.join(root, 'CHANGELOG.md')));
        assert.equal(manifest.atgvDisplayVersion, manifest.version.split('.').map((n, i) => i === 2 ? String(Number(n)).padStart(2, '0') : n).join('.'));
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
