#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const {npmCommand} = require('../src/platform-process');
const {python} = require('./python-runtime');
const ROOT = path.join(__dirname, '..');
function run(bin, args) { const c = bin==='python' ? python(args,{encoding:'utf8',maxBuffer:8e6,timeout:300000}) : (()=>{const command=bin==='npm'?npmCommand(args):{bin,args}; return spawnSync(command.bin,command.args,{encoding:'utf8',maxBuffer:8e6,timeout:300000});})(); if (c.error || c.status !== 0)
    throw Error(`${bin} failed: ${c.error?.message || c.stderr || c.stdout}`); return c.stdout; }
(async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'atgv-offline-'));
    try {
        const archives = [];
        for (const [name, version] of [['quill', '2.0.3'], ['frappe-gantt', '1.2.2']]) {
            const info = JSON.parse(run('npm', ['pack', `${name}@${version}`, '--json', '--pack-destination', dir]));
            archives.push(path.join(dir, info[0].filename));
        }
        run('python', [path.join(__dirname, 'vendor-local.py'), ...archives]);
        console.log('Copied only required Quill and Frappe Gantt runtimes; SVG diagram editor is built into ATGV.');
    }
    finally {
        await fsp.rm(dir, { recursive: true, force: true });
    }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
