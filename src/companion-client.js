'use strict';
const { validateUrl } = require('./utils');
const { requestJson } = require('./clients');
function endpoint(root, project, kind, doc = '') {
    const base = validateUrl(root, { local: true });
    if (!/^[a-z][a-z0-9-]{0,48}$/.test(project))
        throw new Error('Invalid project ID.');
    if (doc && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,110}$/.test(doc))
        throw new Error('Invalid document ID.');
    return `${base}/v1/projects/${encodeURIComponent(project)}/${kind}${doc ? '/' + encodeURIComponent(doc) : ''}`;
}
async function listOwners(root, token, project) { return requestJson(endpoint(root, project, 'ownership'), { token }); }
async function currentUser(root, token) { return requestJson(validateUrl(root, { local: true }) + '/v1/me', { token }); }
async function changeOwner(root, token, project, document, action, expectedRevision) { return requestJson(endpoint(root, project, 'ownership', document), { token, method: 'POST', data: { action, expectedRevision } }); }
async function continueAI(root, token, project, answers) { return requestJson(endpoint(root, project, 'automation'), { token, method: 'POST', data: { answers } }); }
module.exports = { endpoint, listOwners, currentUser, changeOwner, continueAI };
