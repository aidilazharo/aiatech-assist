'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { spec, install, uninstall } = require('./scheduler');
const run = promisify(execFile);
async function nodeRuntime(provided) { const candidate = provided || process.env.ATGV_NODE_PATH || 'node'; const result = await run(candidate, ['-p', 'JSON.stringify({path:process.execPath,version:process.versions.node})'], { timeout: 5000, windowsHide: true }); const info = JSON.parse(result.stdout.trim()); const [major,minor] = String(info.version).split('.').map(Number); if (major < 22 || (major === 22 && minor < 13))
    throw Error('Independent AI service requires Node.js 22.13 or newer with node:sqlite.'); return info.path; }
async function installService({ root, extensionRoot, nodePath }) { const runtime = path.join(os.homedir(), '.atgv', 'ai-runtime'); await fs.mkdir(runtime, { recursive: true, mode: 0o700 }); for (const folder of ['src', 'resources'])
    await fs.cp(path.join(extensionRoot, folder), path.join(runtime, folder), { recursive: true, force: true }); await fs.cp(path.join(extensionRoot, 'service', 'ai'), path.join(runtime, 'service', 'ai'), { recursive: true, force: true }); const config = await require('./config').read(root); const node = await nodeRuntime(nodePath), target = spec({ root, node, script: path.join(runtime, 'service', 'ai', 'cli.js'), minutes: config.interval }); await install(target); return { runtime, node, scheduler: target.name, interval: config.interval }; }
async function removeService({ root, extensionRoot, nodePath }) { const runtime = path.join(os.homedir(), '.atgv', 'ai-runtime'), config = await require('./config').read(root), node = await nodeRuntime(nodePath); return uninstall(spec({ root, node, script: path.join(runtime, 'service', 'ai', 'cli.js'), minutes: config.interval })); }
module.exports = { nodeRuntime, installService, removeService };
