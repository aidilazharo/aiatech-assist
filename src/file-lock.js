'use strict';
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// Windows can report EPERM/EBUSY/EACCES while another handle is closing.
const transient = e => ['EPERM', 'EBUSY', 'EACCES'].includes(e?.code);
async function retryFilesystem(fn) {
    for (let attempt = 0; ; attempt++) {
        try { return await fn(); }
        catch (e) {
            if (!transient(e) || attempt >= 7) throw e;
            await delay(25 + attempt * 25);
        }
    }
}
async function lockFile(file) {
    const name = file + '.lock', token = crypto.randomUUID();
    for (let attempt = 0; attempt < 16; attempt++) {
        try {
            const handle = await retryFilesystem(() => fs.open(name, 'wx', 0o600));
            try {
                await handle.writeFile(JSON.stringify({ pid: process.pid, token, created: Date.now() }));
            }
            finally {
                await handle.close();
            }
            return async () => {
                try {
                    await retryFilesystem(async () => {
                        const current = JSON.parse(await fs.readFile(name, 'utf8'));
                        if (current.token !== token)
                            throw Error('Lock ownership changed.');
                        await fs.rm(name);
                    });
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
            const st = await retryFilesystem(() => fs.lstat(name)).catch(err => err.code === 'ENOENT' ? null : Promise.reject(err));
            if (!st)
                continue;
            if (!st.isFile() || st.isSymbolicLink())
                throw Error('Unsafe lock path.');
            const value = await retryFilesystem(() => fs.readFile(name, 'utf8')).then(JSON.parse).catch(err => { if (err instanceof SyntaxError || err.code === 'ENOENT') return null; throw err; });
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
                await retryFilesystem(async () => {
                    const current = await fs.lstat(name).catch(err => err.code === 'ENOENT' ? null : Promise.reject(err));
                    if (current && current.isFile() && !current.isSymbolicLink() && current.ino === st.ino && current.mtimeMs === st.mtimeMs)
                        await fs.rm(name, { force: true });
                });
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
// Windows scanners and editors can temporarily deny replacing a file. Keep
// the original intact and retry the same atomic rename, never unlink it.
async function replaceFileWithRetry(from,to,{
    rename=fs.rename,check=async()=>{},wait=delay,
    delays=[50,100,200,400,800,1200,1600,2000,2500]
}={}) {
    for(let attempt=0;;attempt++){
        // A revision change, unsafe path or other validation failure is not
        // a transient file lock. Revalidate under the caller's lock each time.
        await check();
        try { return await rename(from,to); }
        catch(error){
            if(!transient(error))throw error;
            if(attempt>=delays.length){
                const failure=new Error('Local file is locked or not writable ('+error.code+'). Automatic save retries exhausted; the existing file was preserved. Close other applications using the file or check folder permissions, then refresh.',{cause:error});
                failure.code=error.code;throw failure;
            }
            await wait(delays[attempt]);
        }
    }
}
module.exports = { withLock, lockFile, replaceFileWithRetry, retryFilesystem };
