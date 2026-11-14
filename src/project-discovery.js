'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
function within(target, folder) {
    const relative = path.relative(folder, target);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
async function realDirectory(directory) {
    try {
        const info = await fs.lstat(directory);
        return info.isDirectory() && !info.isSymbolicLink();
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return false;
        throw e;
    }
}
async function existingManifest(folder) {
    try {
        const stat = await fs.lstat(path.join(folder, 'atgv.project.json'));
        return stat.isFile() && !stat.isSymbolicLink();
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return false;
        throw e;
    }
}
async function workspaceForFolder(folder) {
    let current = path.resolve(folder);
    for (let depth = 0; depth <= 7; depth++) {
        const parent = path.dirname(current);
        if (path.basename(parent) === 'projects' && await realDirectory(current) && await existingManifest(current) && await realDirectory(parent)) {
            return { root: path.dirname(parent), projectId: path.basename(current), source: 'project-folder' };
        }
        if (parent === current)
            break;
        current = parent;
    }
    return { root: path.resolve(folder), projectId: null, source: 'workspace' };
}
function hintedProjectFromFile(root, projectIds, file) {
    if (!file)
        return null;
    const resolved = path.resolve(file);
    for (const id of projectIds) {
        if (within(resolved, path.join(root, 'projects', id)))
            return id;
    }
    return null;
}
function chooseProject(projects, { preferredId = '', folderId = '', activeFile = '', root = '' } = {}) {
    if (!Array.isArray(projects) || projects.length === 0)
        return null;
    const ids = projects.map(p => p.id);
    const fromFile = hintedProjectFromFile(root, ids, activeFile);
    if (fromFile)
        return projects.find(p => p.id === fromFile);
    if (folderId && ids.includes(folderId))
        return projects.find(p => p.id === folderId);
    if (preferredId && ids.includes(preferredId))
        return projects.find(p => p.id === preferredId);
    if (projects.length === 1)
        return projects[0];
    return null;
}
module.exports = { within, workspaceForFolder, hintedProjectFromFile, chooseProject };
