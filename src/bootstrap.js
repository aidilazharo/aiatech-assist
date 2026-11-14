'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { ensureWorkspaceLibrary, scaffoldProject } = require('./tech-stacks');
async function initializeWorkspaceFolders(workspace, registry) {
    if (!workspace || !registry)
        return { initialized: false, projects: 0 };
    await registry.ensureRoot();
    await ensureWorkspaceLibrary(workspace);
    const projects = await registry.list();
    for (const project of projects)
        await scaffoldProject(workspace, project);
    return { initialized: true, projects: projects.length };
}
async function installationSignature(extensionDirectory, version) {
    const manifest = path.join(extensionDirectory, 'package.json');
    const stat = await fs.stat(manifest);
    return `${version}|${path.resolve(extensionDirectory)}|${stat.ctimeMs}`;
}
function lifecycleAction(signature, lastSignature, pendingStart) {
    if (pendingStart)
        return 'start';
    if (signature !== lastSignature)
        return 'offer-reload';
    return 'none';
}
module.exports = { initializeWorkspaceFolders, installationSignature, lifecycleAction };
