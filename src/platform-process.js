'use strict';
// Run npm through its JavaScript CLI on Windows instead of spawning npm.cmd
// (Node's shell:false child_process APIs cannot launch .cmd/.bat reliably).
// No shell interpolation and no globally installed native npm dependencies.
const fs = require('node:fs');
const path = require('node:path');

function npmCommand(args = [], { platform = process.platform, env = process.env,
    exists = fs.existsSync } = {}) {
    if (platform !== 'win32') return { bin: 'npm', args: [...args] };
    const win = path.win32;
    const paths = String(env.Path || env.PATH || '').split(';').filter(Boolean).map(p => p.replace(/^"|"$/g, ''));
    // Windows PowerShell may refuse npm.ps1. Launch npm-cli.js under node.exe
    // with shell:false instead of depending on npm.cmd or execution policies.
    const candidates = [];
    if (env.npm_execpath && /[\\/]npm-cli\.js$/i.test(env.npm_execpath)) candidates.push(env.npm_execpath);
    for (const folder of paths) {
        candidates.push(win.join(folder, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
        candidates.push(win.resolve(folder, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
        candidates.push(win.join(folder, 'npm', 'bin', 'npm-cli.js'));
    }
    const cli = candidates.find(p => exists(p));
    if (!cli) throw Error('Windows npm executable is unavailable. Install Node.js LTS with npm, ensure node.exe and npm.cmd are on PATH, restart VS Code, then retry.');
    const home = paths.find(p => exists(win.join(p, 'node.exe')));
    return { bin: home ? win.join(home, 'node.exe') : 'node.exe', args: [cli, ...args] };
}
// The official @openai/codex npm package ships a portable JS CLI as well as
// Windows .cmd shims. Prefer the JS program under node.exe and never use a shell.
function codexCommand(binary, args = [], { platform = process.platform, exists = fs.existsSync } = {}) {
    if (platform !== 'win32') return { bin: binary, args: [...args] };
    if (/\.js$/i.test(binary)) return { bin: 'node.exe', args: [binary, ...args] };
    if (/\.cmd$/i.test(binary)) {
        const root = path.win32.resolve(path.win32.dirname(binary), '..', '@openai', 'codex', 'bin', 'codex.js');
        if (exists(root)) return { bin: 'node.exe', args: [root, ...args] };
        throw Error('Codex Windows launcher requires the official @openai/codex JavaScript CLI or codex.exe. Reinstall Codex using the ATGV installer.');
    }
    return { bin: binary, args: [...args] };
}
module.exports = { npmCommand, codexCommand };
