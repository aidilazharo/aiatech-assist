'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'package.json');
const {nextVersion,requireIncrement}=require('../src/version-policy');
function parseVersion(input) {
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(input || '');
    if (!match)
        throw new Error('Use MAJOR.MINOR.PATCH, each integer 0–99, e.g. 0.00.01');
    const nums = match.slice(1).map(Number);
    if (nums.some(n => n > 99))
        throw new Error('Each version component must be 0–99.');
    return { semver: nums.join('.'), display: nums.join('.') };
}
if (require.main === module) {
    try {
        const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
        const v=parseVersion(process.argv[2]||nextVersion(manifest.version));
        requireIncrement(manifest.version,v.semver);
        const priorDisplayVersion=manifest.atgvDisplayVersion;
        if(priorDisplayVersion!==manifest.version)throw Error('Manifest display version does not match package version.');
        const root=path.join(__dirname,'..');
        const readme=path.join(root,'README.md');
        const release=path.join(root,'RELEASE.md');
        const previous=fs.readFileSync(readme,'utf8');
        const readmeVersion=previous.match(/^\*\*Version: ([^*]+)\*\*/m);
        if(!readmeVersion||readmeVersion[1]!==manifest.version)throw Error('README version did not match previous manifest.');
        const dashboard=path.join(root,'src','lib','webview','dashboard-html.js');
        const source=fs.readFileSync(dashboard,'utf8');
        const previousLiteral="atgvDisplayVersion :'"+priorDisplayVersion+"'";
        if(!source.includes(previousLiteral))throw Error('Dashboard source version did not match previous manifest.');
        // Validate every version source before changing any file.
        manifest.version = v.semver;
        manifest.atgvDisplayVersion = v.display;
        fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
        fs.writeFileSync(readme,previous.replace(/^\*\*Version: [^*]+\*\*/m,'**Version: '+v.semver+'**'));
        fs.writeFileSync(dashboard,source.replace(previousLiteral,"atgvDisplayVersion :'"+v.semver+"'"));
        fs.writeFileSync(release,'# ATGV AIATECH Assist v'+v.semver+'\n\n## Changes\n\n- Describe verified changes in this release.\n\n## Validation\n\n- Record Node regressions, Windows checks, VSIX verification and release provenance.\n');

        console.log(`Saved display version ${v.display} (VS Code SemVer ${v.semver})`);
    }
    catch (e) {
        console.error(e.message);
        process.exitCode = 1;
    }
}
module.exports = { parseVersion };
