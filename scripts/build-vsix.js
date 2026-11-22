'use strict';
const { spawnSync } = require('node:child_process');
const {python} = require('./python-runtime');
const path = require('node:path');
const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const target = path.join(root, '..', `${pkg.name}-${pkg.version}.vsix`);
for (const [name, args] of [
    [process.execPath, [path.join(__dirname, 'generate-ui-theme.js'), '--check']],
    ['python', [path.join(__dirname, 'package-vsix.py')]],
    [process.execPath, ['--require', path.join(root, 'test', 'local-network-only.js'), path.join(__dirname, 'verify-vsix.js'), target]]
]) {
    const result = name === 'python' ? python(args, { stdio: 'inherit' }) : spawnSync(name, args, { stdio: 'inherit' });
    if (result.error) {
        console.error(result.error);
        process.exitCode = 1;
        break;
    }
    if (result.status !== 0) {
        process.exitCode = result.status || 1;
        break;
    }
}
