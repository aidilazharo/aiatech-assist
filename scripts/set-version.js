'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'package.json');
function parseVersion(input) {
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(input || '');
    if (!match)
        throw new Error('Use MAJOR.MINOR.PATCH, each integer 0–99, e.g. 0.00.01');
    const nums = match.slice(1).map(Number);
    if (nums.some(n => n > 99))
        throw new Error('Each version component must be 0–99.');
    return { semver: nums.join('.'), display: `${nums[0]}.${String(nums[1])}.${String(nums[2]).padStart(2, '0')}` };
}
if (require.main === module) {
    try {
        const v = parseVersion(process.argv[2]);
        const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
        manifest.version = v.semver;
        manifest.atgvDisplayVersion = v.display;
        fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
        console.log(`Saved display version ${v.display} (VS Code SemVer ${v.semver})`);
    }
    catch (e) {
        console.error(e.message);
        process.exitCode = 1;
    }
}
module.exports = { parseVersion };
