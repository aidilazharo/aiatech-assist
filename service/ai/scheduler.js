'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { hash } = require('./memory');
function interval(value) { const n = Number(value); if (!Number.isInteger(n) || n < 15 || n > 1440)
    throw Error('Interval must be 15–1440 minutes.'); return n; }
function xml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function systemdEscape(value) { return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')}"`; }
function plist({ node, script, root, minutes }) { const args = [node, script, '--project', root]; return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.atgv.ai.${hash(root).slice(0, 12)}</string><key>ProgramArguments</key><array>${args.map(v => `<string>${xml(v)}</string>`).join('')}</array><key>StartInterval</key><integer>${minutes * 60}</integer><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>StandardOutPath</key><string>${xml(path.join(os.homedir(), '.atgv-ai-service.log'))}</string></dict></plist>`; }
function spec({ platform = process.platform, node = process.execPath, script, root, minutes = 60, home = os.homedir() }) {
    interval(minutes);
    if (!path.isAbsolute(root) || !path.isAbsolute(script) || !path.isAbsolute(node))
        throw Error('Scheduler paths must be absolute.');
    const id = hash(root).slice(0, 12);
    if (platform === 'linux') {
        const dir = path.join(home, '.config', 'systemd', 'user'), name = `atgv-ai-${id}`;
        return { platform, id, name, dir, service: path.join(dir, name + '.service'), timer: path.join(dir, name + '.timer'), serviceText: `[Unit]\nDescription=ATGV AI approved SDLC proposals\n[Service]\nType=oneshot\nExecStart=${[node, script, '--project', root].map(systemdEscape).join(' ')}\n`, timerText: `[Unit]\nDescription=ATGV AI periodic orchestration\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=${minutes}min\nPersistent=true\n[Install]\nWantedBy=timers.target\n` };
    }
    if (platform === 'darwin') {
        const dir = path.join(home, 'Library', 'LaunchAgents');
        return { platform, id, name: `com.atgv.ai.${id}`, dir, file: path.join(dir, `com.atgv.ai.${id}.plist`), text: plist({ node, script, root, minutes }) };
    }
    if (platform === 'win32') {
        const name = `ATGV-AI-${id}`;
        const quote = v => '"' + String(v).replace(/"/g, '\\"') + '"';
        return { platform, id, name, command: `${quote(node)} ${quote(script)} --project ${quote(root)}`, minutes };
    }
    throw Error('Unsupported operating system.');
}
async function command(executable, args) { return new Promise((resolve, reject) => { const process = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let err = ''; process.stderr.on('data', x => err += x.toString().slice(0, 2000)); process.on('error', reject); process.on('exit', code => code === 0 ? resolve() : reject(Error(`${executable} failed (${code}): ${err.slice(0, 500)}`))); }); }
async function install(specification, { exec = command } = {}) { const s = specification; if (s.platform === 'linux') {
    await fs.mkdir(s.dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(s.service, s.serviceText, { mode: 0o600 });
    await fs.writeFile(s.timer, s.timerText, { mode: 0o600 });
    await exec('systemctl', ['--user', 'daemon-reload']);
    await exec('systemctl', ['--user', 'enable', '--now', path.basename(s.timer)]);
}
else if (s.platform === 'darwin') {
    await fs.mkdir(s.dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(s.file, s.text, { mode: 0o600 });
    await exec('launchctl', ['bootstrap', `gui/${process.getuid()}`, s.file]);
}
else if (s.platform === 'win32') {
    await exec('schtasks', ['/Create', '/F', '/SC', 'MINUTE', '/MO', String(s.minutes), '/TN', s.name, '/TR', s.command]);
}
else
    throw Error('Unsupported scheduler.'); return s; }
async function uninstall(s, { exec = command } = {}) { if (s.platform === 'linux') {
    await exec('systemctl', ['--user', 'disable', '--now', path.basename(s.timer)]).catch(() => { });
    await fs.rm(s.service, { force: true });
    await fs.rm(s.timer, { force: true });
    await exec('systemctl', ['--user', 'daemon-reload']);
}
else if (s.platform === 'darwin') {
    await exec('launchctl', ['bootout', `gui/${process.getuid()}`, s.file]).catch(() => { });
    await fs.rm(s.file, { force: true });
}
else if (s.platform === 'win32')
    await exec('schtasks', ['/Delete', '/F', '/TN', s.name]).catch(() => { }); return s; }
module.exports = { spec, install, uninstall, interval, plist };
