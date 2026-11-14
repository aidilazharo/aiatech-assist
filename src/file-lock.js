'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function lockFile(file) {
    const name = file + '.lock', token = crypto.randomUUID();
    for (let attempt = 0; attempt < 16; attempt++) {
        try {
            const handle = await fs.open(name, 'wx', 0o600);
            try {
                await handle.writeFile(JSON.stringify({ pid: process.pid, token, created: Date.now() }));
            }
            finally {
                await handle.close();
            }
            return async () => {
                try {
                    const current = JSON.parse(await fs.readFile(name, 'utf8'));
                    if (current.token !== token)
                        throw Error('Lock ownership changed.');
                    await fs.rm(name);
                }
                catch (e) {
                    if (e.code !== 'ENOENT')
                        throw e;
                }
            };
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
            const st = await fs.lstat(name).catch(err => err.code === 'ENOENT' ? null : Promise.reject(err));
            if (!st)
                continue;
            if (!st.isFile() || st.isSymbolicLink())
                throw Error('Unsafe lock path.');
            const value = await fs.readFile(name, 'utf8').then(JSON.parse).catch(() => null);
            const age = Date.now() - (value?.created || st.mtimeMs);
            let alive = false;
            if (Number.isInteger(value?.pid) && value.pid > 0) {
                try {
                    process.kill(value.pid, 0);
                    alive = true;
                }
                catch (e) {
                    if (e.code === 'EPERM')
                        alive = true;
                }
            }
            if (age > 60000 && !alive) {
                const current = await fs.lstat(name).catch(() => null);
                if (current && current.ino === st.ino && current.mtimeMs === st.mtimeMs)
                    await fs.rm(name, { force: true });
                continue;
            }
            if (attempt === 15)
                throw Error('Document is locked by another process. Retry after the operation finishes; if it persists, inspect the local lock safely.');
            await delay(25 + attempt * 10);
        }
    }
    throw Error('Unable to acquire document lock.');
}
async function withLock(file, fn) { const unlock = await lockFile(file); try {
    return await fn();
}
finally {
    await unlock();
} }
module.exports = { withLock, lockFile };
