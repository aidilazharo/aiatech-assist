'use strict';
const crypto = require('node:crypto');
const id = process.argv[2], project = process.argv[3];
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,110}$/.test(id || '') || !/^[a-z][a-z0-9-]{0,48}$/.test(project || '')) {
    console.error('Usage: node scripts/create-service-user.js <employee-id> <project-id>');
    process.exitCode = 1;
}
else {
    const token = crypto.randomBytes(32).toString('base64url');
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    console.log('USER TOKEN (give privately to the person): ' + token);
    console.log('Add this entry to the server users JSON object (merge entries, do not replace existing users):');
    console.log(JSON.stringify({ [digest]: { id, projects: [project], canStartAI: false } }, null, 2));
}
