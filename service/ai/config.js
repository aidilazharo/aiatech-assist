'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { interval } = require('./scheduler');
function filename(root) { return path.join(root, 'knowledge', 'ai-service.json'); }
async function read(root) { try {
    const data = JSON.parse(await fs.readFile(filename(root), 'utf8'));
    return { enabled: !!data.enabled, interval: interval(data.interval ?? 60), mode: ['vscode', 'independent'].includes(data.mode) ? data.mode : 'vscode' };
}
catch (e) {
    if (e.code === 'ENOENT')
        return { enabled: false, interval: 60, mode: 'vscode' };
    throw e;
} }
async function write(root, config) { const normalized = { enabled: config.enabled === true, interval: interval(config.interval ?? 60), mode: ['vscode', 'independent'].includes(config.mode) ? config.mode : 'vscode' }; const file = filename(root), dir = path.dirname(file); await fs.mkdir(dir, { recursive: true, mode: 0o700 }); const st = await fs.lstat(file).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e)); if (st?.isSymbolicLink())
    throw Error('Unsafe service settings link.'); const tmp = file + '.' + crypto.randomUUID() + '.tmp'; try {
    await fs.writeFile(tmp, JSON.stringify(normalized, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(tmp, file);
}
finally {
    await fs.rm(tmp, { force: true });
} return normalized; }
module.exports = { filename, read, write };
