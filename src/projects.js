'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateUrl } = require('./utils');
const ID_RE = /^[a-z][a-z0-9-]{0,48}$/;
const IMPORT_FOLDER_RE = /^[a-z][a-z0-9-]{0,48}$/i;
const CONNECTION_KEYS = [
    'jira.baseUrl', 'jira.email', 'jira.projectKey', 'jira.jql',
    'confluence.spaceId', 'confluence.spaceKey', 'confluence.spaceName', 'confluence.baseUrl', 'confluence.parentPageId',
    'github.owner', 'github.repo', 'github.branch', 'github.pathPrefix', 'github.apiUrl'
];
const EXTENSION_DEFAULTS = { jira: { baseUrl: '', email: '', projectKey: '', jql: '' }, confluence: { spaceId: '', spaceKey: '', spaceName: '', baseUrl: '', parentPageId: '' }, github: { owner: '', repo: '', branch: '', pathPrefix: '', apiUrl: 'https://api.github.com' } };
function validGithubBranch(value) {
    if (typeof value !== 'string') throw new Error('GitHub branch must be text.');
    const branch = value.trim();
    if (!branch) return '';
    if (branch.length > 180 || !/^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/.test(branch) ||
        branch.includes('..') || branch.includes('//') || branch.includes('@{') ||
        branch.endsWith('/') || branch.endsWith('.') || branch.split('/').some(s =>
            !s || s.startsWith('.') || s.endsWith('.lock') || s.endsWith('.'))) {
        throw new Error('Invalid GitHub branch name. Choose an existing branch from the repository list.');
    }
    return branch;
}
const LEGACY_ALIASES = { 'atlassian.baseUrl': 'jira.baseUrl', 'atlassian.email': 'jira.email' };
function projectSlug(value) {
    const id = String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 49).replace(/-+$/, '');
    if (!ID_RE.test(id))
        throw new Error('Project ID must begin with a letter, use letters, digits or hyphens, and be at most 49 characters.');
    return id;
}
function checkString(value, label, max = 2000) {
    if (value !== undefined && typeof value !== 'string')
        throw new Error(`${label} must be text.`);
    const result = (value || '').trim();
    if (result.length > max)
        throw new Error(`${label} is too long.`);
    return result;
}
function parseRepoUrl(value) {
    const raw = checkString(value, 'GitHub repository', 600);
    if (!raw)
        return { owner: '', repo: '' };
    const parsed = new URL(validateUrl(raw));
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !['github.com', 'www.github.com'].includes(parsed.hostname))
        throw new Error('Enter a https://github.com/owner/repository URL (no query, fragment or credentials).');
    const parts = parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (parts.length !== 2)
        throw new Error('Enter a full GitHub repository URL, e.g. https://github.com/org/repo.');
    const [owner, repo] = [parts[0], parts[1].replace(/\.git$/, '')];
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo))
        throw new Error('Invalid GitHub repository URL.');
    return { owner, repo };
}
function normalizeGithubRepository(ownerValue, repoValue) {
    const enteredOwner = checkString(ownerValue, 'GitHub owner', 600);
    const enteredRepo = checkString(repoValue, 'GitHub repository', 600);
    let resolved = { owner: '', repo: enteredRepo };
    if (/^https?:\/\//i.test(enteredRepo))
        resolved = parseRepoUrl(enteredRepo);
    else if (enteredRepo.includes('/')) {
        const parts = enteredRepo.split('/');
        if (parts.length !== 2 || !parts.every(Boolean))
            throw new Error('Use a repository name, owner/repo, or https://github.com/owner/repo.');
        resolved = { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
    }
    if (enteredOwner && resolved.owner && enteredOwner.toLowerCase() !== resolved.owner.toLowerCase())
        throw new Error('GitHub owner does not match the repository URL.');
    const owner = enteredOwner || resolved.owner, repo = resolved.repo;
    if (owner && !/^[\w.-]+$/.test(owner))
        throw new Error('GitHub owner is invalid.');
    if (repo && !/^[\w.-]+$/.test(repo))
        throw new Error('GitHub repository is invalid.');
    return { owner, repo };
}
function normalizeSettings(fields = {}) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields))
        throw new Error('Invalid connection settings.');
    fields = { ...fields, jira: { ...fields.jira, baseUrl: fields.jira?.baseUrl || fields.jiraBaseUrl || fields.atlassian?.baseUrl || '', email: fields.jira?.email || fields.jiraEmail || fields.atlassian?.email || '' },
        confluence: { ...fields.confluence, spaceId: fields.confluence?.spaceId || fields.confluenceSpaceId || '', spaceKey: fields.confluence?.spaceKey || fields.confluenceSpaceKey || '', spaceName: fields.confluence?.spaceName || fields.confluenceSpaceName || '', baseUrl: fields.confluence?.baseUrl || fields.confluenceBaseUrl || '' },
        github: { ...fields.github, owner: fields.github?.owner || fields.githubOwner || '', repo: fields.github?.repo || fields.githubRepository || '' } };
    const result = { jira: {}, confluence: {}, github: {} };
    if (fields.development !== undefined && (!fields.development || typeof fields.development !== 'object' || Array.isArray(fields.development)))
        throw Error('Invalid project development settings.');
    if (fields.development?.previewWithoutTests !== undefined && typeof fields.development.previewWithoutTests !== 'boolean')
        throw Error('Development previewWithoutTests must be a boolean.');
    result.development = { previewWithoutTests: fields.development?.previewWithoutTests === true };
    for (const item of CONNECTION_KEYS) {
        const [group, key] = item.split('.');
        const value = checkString(fields[group]?.[key], item, item === 'jira.jql' ? 2000 : 600);
        if (value)
            result[group][key] = value;
    }
    if (result.jira.baseUrl)
        result.jira.baseUrl = validateUrl(result.jira.baseUrl).replace(/\/wiki\/?$/, '');
    if (result.confluence.baseUrl) {
        result.confluence.baseUrl = validateUrl(result.confluence.baseUrl).replace(/\/$/, '');
        // Separate Atlassian Cloud sites may use the same account email/token.
        // Validate access to each site independently before saving onboarding.
        if (result.jira.baseUrl && new URL(result.confluence.baseUrl).origin !== new URL(result.jira.baseUrl).origin &&
            (!new URL(result.confluence.baseUrl).hostname.endsWith('.atlassian.net') ||
             !new URL(result.jira.baseUrl).hostname.endsWith('.atlassian.net')))
            throw new Error('Separate Jira and Confluence sites must use trusted Atlassian Cloud domains.');
        if (!result.confluence.baseUrl.endsWith('/wiki'))
            result.confluence.baseUrl += '/wiki';
    }
    if (result.confluence.spaceId && !/^\d+$/.test(result.confluence.spaceId))
        throw new Error('Confluence space ID must contain digits only.');
    if (result.github.branch) result.github.branch = validGithubBranch(result.github.branch);
    if (result.github.apiUrl)
        result.github.apiUrl = validateUrl(result.github.apiUrl);
    if (result.jira.projectKey) {
        result.jira.projectKey = result.jira.projectKey.toUpperCase();
        if (!/^[A-Z][A-Z0-9_-]{0,39}$/.test(result.jira.projectKey))
            throw new Error('Jira project key is invalid.');
    }
    if (result.confluence.parentPageId && !/^\d+$/.test(result.confluence.parentPageId))
        throw new Error('Confluence parent page ID must contain digits only.');
    const resolvedGithub = normalizeGithubRepository(result.github.owner, result.github.repo);
    if (resolvedGithub.owner)
        result.github.owner = resolvedGithub.owner;
    if (resolvedGithub.repo)
        result.github.repo = resolvedGithub.repo;
    if ((result.github.pathPrefix || '').split('/').some(s => s === '..' || s === '.') || (result.github.pathPrefix || '').startsWith('/'))
        throw new Error('GitHub path prefix must be relative.');
    return result;
}
function normalizeExtensionSettings(input = {}) { return normalizeSettings(input); }
function normalizeProjectSchedule(input, existing = {}) {
    const source = input === undefined ? existing : input;
    if (!source || typeof source !== 'object' || Array.isArray(source))
        throw new Error('Invalid project schedule.');
    const startDate = checkString(source.startDate, 'Project start date', 10);
    const endDate = checkString(source.endDate, 'Project end date', 10);
    const validDate = value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value);
    if (!validDate(startDate) || !validDate(endDate))
        throw new Error('Project schedule dates must be valid YYYY-MM-DD dates.');
    if (Boolean(startDate) !== Boolean(endDate))
        throw new Error('Set both project start and end dates, or leave both blank.');
    if (startDate && endDate < startDate)
        throw new Error('Project end date cannot precede project start date.');
    return { startDate, endDate };
}
function normalizeProjectInput(input = {}, existing) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid project details.');
    const name = checkString(input.name, 'Project name', 120);
    if (!name)
        throw new Error('Project name is required.');
    const id = existing?.id || (input.id ? checkString(input.id, 'Project ID', 49) : projectSlug(name));
    if (!ID_RE.test(id))
        throw new Error('Invalid project ID. Use lowercase letters, digits and hyphens, starting with a letter.');
    const now = new Date().toISOString();
    const techStackId = String(input.techStackId === undefined ? (existing?.techStackId || '') : input.techStackId);
    if (techStackId && !ID_RE.test(techStackId))
        throw new Error('Unknown tech stack template.');
    const techStackCompanionId = String(input.techStackCompanionId === undefined ? (existing?.techStackCompanionId || '') : (input.techStackCompanionId || ''));
    if (techStackCompanionId && (!ID_RE.test(techStackCompanionId) || techStackCompanionId === techStackId))
        throw Error('Invalid companion technology stack.');
    const techStackGeneration = input.techStackGeneration === undefined ? (existing?.techStackGeneration || 0) : input.techStackGeneration;
    if (!Number.isSafeInteger(techStackGeneration) || techStackGeneration < 0 || techStackGeneration > 9999)
        throw Error('Invalid technology stack generation.');
    const stackChanged = !!existing && (existing.techStackId !== techStackId || (existing.techStackCompanionId || '') !== techStackCompanionId);
    const requestedPreparation = stackChanged ? null : (input.techStackPrepared === undefined ? existing?.techStackPrepared || null : input.techStackPrepared);
    // Persist the Save Stack gate through registry normalization; otherwise the
    // webview sees an unsaved stack after the action appears to succeed.
    let techStackPrepared = null;
    if (requestedPreparation) {
        if (typeof requestedPreparation !== 'object' || Array.isArray(requestedPreparation) ||
            requestedPreparation.stackId !== techStackId ||
            (requestedPreparation.companionId || '') !== techStackCompanionId ||
            typeof requestedPreparation.root !== 'string' || !path.isAbsolute(requestedPreparation.root) ||
            requestedPreparation.root.length > 2048)
            throw Error('Invalid saved technology stack repository state.');
        techStackPrepared = {
            stackId: techStackId, companionId: techStackCompanionId,
            root: path.normalize(requestedPreparation.root),
            branch: typeof requestedPreparation.branch === 'string' && (
                /^bootstrap\/[a-z0-9-]{1,80}$/.test(requestedPreparation.branch) ||
                (/^migration\/[a-z0-9-]{1,120}$/.test(requestedPreparation.branch) &&
                 requestedPreparation.branch.startsWith('migration/'+techStackId+'-catalog-'))
            ) ? requestedPreparation.branch : '',
            baseBranch: validGithubBranch(requestedPreparation.baseBranch || '') || 'main',
            sha: typeof requestedPreparation.sha === 'string' && /^[a-f0-9]{40}$/.test(requestedPreparation.sha) ? requestedPreparation.sha : '',
            remotePushed: requestedPreparation.remotePushed === true,
            previewUrl: typeof requestedPreparation.previewUrl === 'string' ? requestedPreparation.previewUrl.slice(0, 255) : '',
            at: String(requestedPreparation.at || '').slice(0, 60)
        };
    }
    const techStackValidation = stackChanged ? null : (input.techStackValidation === undefined ? existing?.techStackValidation || null : input.techStackValidation);
    const techStackApproval = stackChanged ? null : (input.techStackApproval === undefined ? existing?.techStackApproval || null : input.techStackApproval);
    const requestedServerVerification = stackChanged ? null : (input.techStackServerVerification === undefined ? existing?.techStackServerVerification || null : input.techStackServerVerification);
    // A server smoke check is valid only for the prepared stack's exact revision.
    const techStackServerVerification = techStackPrepared && requestedServerVerification?.status === 'verified' &&
        requestedServerVerification.stackId === techStackId &&
        (requestedServerVerification.companionId || '') === techStackCompanionId &&
        requestedServerVerification.root === techStackPrepared.root &&
        requestedServerVerification.sha === techStackPrepared.sha &&
        requestedServerVerification.branch === techStackPrepared.branch &&
        typeof requestedServerVerification.at === 'string' ? {
          status: 'verified', stackId: techStackId, companionId: techStackCompanionId,
          root: techStackPrepared.root, sha: techStackPrepared.sha,
          branch: techStackPrepared.branch, at: requestedServerVerification.at.slice(0,60)
        } : null;
    return { schema: 4, id, name, techStackId, techStackCompanionId, techStackGeneration, techStackPrepared, techStackValidation, techStackServerVerification, techStackApproval, createdAt: existing?.createdAt || now, updatedAt: now, schedule: normalizeProjectSchedule(input.schedule, existing?.schedule), settings: normalizeSettings(input.settings === undefined ? (existing?.settings || {}) : input.settings) };
}
function projectConfig(project, extensionSettings = {}, globalConfig = { get: (_, fallback) => fallback }) {
    const projectSettings = project?.settings || {};
    const getRaw = (key) => {
        if (!CONNECTION_KEYS.includes(key))
            return undefined;
        const [group, field] = key.split('.');
        if (group === 'jira' && ['baseUrl', 'email'].includes(field))
            return projectSettings.jira?.[field] || projectSettings.atlassian?.[field] || extensionSettings.jira?.[field] || extensionSettings.atlassian?.[field] || '';
        return projectSettings[group]?.[field] || extensionSettings[group]?.[field] || EXTENSION_DEFAULTS[group]?.[field] || '';
    };
    return { get(key, defaultValue) {
            if (key === 'jira.jql') {
                const explicit = projectSettings.jira?.jql;
                if (explicit)
                    return explicit;
                const projectKey = projectSettings.jira?.projectKey || extensionSettings.jira?.projectKey;
                if (projectKey)
                    return `project = "${projectKey}" ORDER BY updated DESC`;
                return extensionSettings.jira?.jql || '';
            }
            if (LEGACY_ALIASES[key])
                return getRaw(LEGACY_ALIASES[key]);
            if (key === 'confluence.baseUrl') {
                const explicit = getRaw(key);
                return explicit || (getRaw('jira.baseUrl') ? getRaw('jira.baseUrl') + '/wiki' : '');
            }
            if (CONNECTION_KEYS.includes(key))
                return getRaw(key);
            return globalConfig.get(key, defaultValue);
        } };
}
class ProjectRegistry {
    constructor(workspacePath) {
        if (!path.isAbsolute(workspacePath))
            throw new Error('Absolute workspace path required.');
        this.workspace = workspacePath;
        this.root = path.join(workspacePath, 'projects');
    }
    fileFor(id) { if (!ID_RE.test(id))
        throw new Error('Invalid project ID.'); return path.join(this.root, id, 'atgv.project.json'); }
    async ensureRoot() {
        let st;
        try {
            st = await fs.lstat(this.root);
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        if (st && (!st.isDirectory() || st.isSymbolicLink()))
            throw new Error('Projects folder must be a real directory, not a symlink.');
        if (!st)
            await fs.mkdir(this.root, { recursive: true });
        st = await fs.lstat(this.root);
        if (!st.isDirectory() || st.isSymbolicLink())
            throw new Error('Projects folder must be a real directory.');
        return this.root;
    }
    async list() {
        let entries;
        try {
            entries = await fs.readdir(this.root, { withFileTypes: true });
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return [];
            throw e;
        }
        const result = [];
        for (const item of entries) {
            if (!item.isDirectory() || !ID_RE.test(item.name))
                continue;
            try {
                result.push(await this.read(item.name));
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }
    async unmanagedFolders() {
        let entries;
        try {
            entries = await fs.readdir(this.root, { withFileTypes: true });
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return [];
            throw e;
        }
        const names = entries.filter(entry => entry.isDirectory() && IMPORT_FOLDER_RE.test(entry.name)).map(entry => entry.name);
        const result = [];
        for (const folder of names) {
            const id = folder.toLowerCase(), file = path.join(this.root, folder, 'atgv.project.json');
            let manifest = null, error = '', hasManifest = false;
            try {
                const st = await fs.lstat(file);
                hasManifest = true;
                if (!st.isFile() || st.isSymbolicLink())
                    throw new Error('Project manifest must be a regular file.');
                manifest = JSON.parse(await fs.readFile(file, 'utf8'));
                if (!manifest || !Number.isInteger(manifest.schema) || ![1, 2, 3, 4].includes(manifest.schema) || typeof manifest.id !== 'string' || manifest.id.toLowerCase() !== id || !manifest.name)
                    throw new Error('Existing project manifest does not match this folder.');
                normalizeProjectInput({ ...manifest, id }, { ...manifest, id });
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    error = e.message;
            }
            if (folder === id && manifest && !error)
                continue;
            const duplicate = names.some(name => name !== folder && name.toLowerCase() === id);
            const blocked = Boolean(error || duplicate);
            result.push({ folder, id, name: manifest?.name || folder, hasManifest, blocked, reason: error || (duplicate ? 'Another project folder has the same ID ignoring letter case.' : '') });
        }
        return result.sort((a, b) => a.folder.localeCompare(b.folder));
    }
    async importExistingFolder(folder) {
        if (typeof folder !== 'string' || !IMPORT_FOLDER_RE.test(folder))
            throw new Error('Invalid project folder name.');
        await this.ensureRoot();
        const candidate = (await this.unmanagedFolders()).find(item => item.folder === folder);
        if (!candidate)
            throw new Error('This folder is already registered or cannot be imported. Refresh the project list.');
        if (candidate.blocked)
            throw new Error(candidate.reason);
        const source = path.join(this.root, folder), target = path.join(this.root, candidate.id);
        const st = await fs.lstat(source);
        if (!st.isDirectory() || st.isSymbolicLink())
            throw new Error('Project folder must be a real directory.');
        let old = null;
        if (candidate.hasManifest) {
            old = JSON.parse(await fs.readFile(path.join(source, 'atgv.project.json'), 'utf8'));
            if (old.id.toLowerCase() !== candidate.id)
                throw new Error('Project manifest changed. Refresh and retry.');
        }
        const item = old ? { ...old, id: candidate.id } : normalizeProjectInput({ id: candidate.id, name: folder });
        const normalized = normalizeProjectInput(item, { ...item, id: candidate.id });
        if (old) {
            item.id = candidate.id;
            item.updatedAt = normalized.updatedAt;
        }
        let moved = false;
        if (source !== target) {
            try {
                const existing = await fs.lstat(target);
                if (existing.dev !== st.dev || existing.ino !== st.ino)
                    throw new Error('Destination project folder already exists.');
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
            await fs.rename(source, target);
            moved = true;
        }
        const config = path.join(target, 'atgv.project.json');
        try {
            if (old) {
                const tmp = config + '.import-' + process.pid + '.tmp';
                await fs.writeFile(tmp, JSON.stringify(item, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
                try {
                    await fs.rename(tmp, config);
                }
                catch (e) {
                    await fs.rm(tmp, { force: true });
                    throw e;
                }
            }
            else
                await fs.writeFile(config, JSON.stringify(item, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            return await this.read(candidate.id);
        }
        catch (e) {
            if (moved)
                await fs.rename(target, source).catch(() => { });
            throw e;
        }
    }
    async read(id) {
        const file = this.fileFor(id);
        for (const p of [this.root, path.dirname(file), file]) {
            const st = await fs.lstat(p);
            if (st.isSymbolicLink())
                throw new Error('ATGV project paths must not be symbolic links.');
        }
        const item = JSON.parse(await fs.readFile(file, 'utf8'));
        if (item.id !== id || ![1, 2, 3, 4].includes(item.schema))
            throw new Error(`Invalid project settings for ${id}.`);
        normalizeProjectInput(item, item);
        return item;
    }
    async create(input) {
        const item = normalizeProjectInput(input);
        const dir = path.dirname(this.fileFor(item.id));
        await this.ensureRoot();
        const folders = await fs.readdir(this.root);
        if (folders.some(name => name.toLowerCase() === item.id)) {
            const error = new Error(`Project folder ${item.id} already exists (folder names are case-insensitive). Import the existing folder instead.`);
            error.code = 'EEXIST';
            throw error;
        }
        await fs.mkdir(dir);
        try {
            await fs.writeFile(this.fileFor(item.id), JSON.stringify(item, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        }
        catch (e) {
            await fs.rmdir(dir).catch(() => { });
            throw e;
        }
        return item;
    }
    async update(id, input) {
        const existing = await this.read(id);
        const next = normalizeProjectInput(input, existing);
        const file = this.fileFor(id), tmp = file + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        try {
            await fs.rename(tmp, file);
        }
        catch (e) {
            await fs.rm(tmp, { force: true });
            throw e;
        }
        return next;
    }
    async resetFolder() {
        if (path.basename(this.root) !== 'projects' || path.dirname(this.root) !== this.workspace)
            throw new Error('Unsafe reset target.');
        let st;
        try {
            st = await fs.lstat(this.root);
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return;
            throw e;
        }
        if (!st.isDirectory() || st.isSymbolicLink())
            throw new Error('Refusing reset: projects is not a regular folder.');
        for (const name of await fs.readdir(this.root))
            await fs.rm(path.join(this.root, name), { recursive: true, force: true });
    }
}
module.exports = { projectSlug, parseRepoUrl, normalizeGithubRepository, normalizeExtensionSettings, normalizeProjectInput, normalizeProjectSchedule, projectConfig, ProjectRegistry, EXTENSION_DEFAULTS, validGithubBranch };
).test(requestedPreparation.branch)
             ) ? requestedPreparation.branch : '',
            baseBranch: validGithubBranch(requestedPreparation.baseBranch || '') || 'main',
            sha: typeof requestedPreparation.sha === 'string' && /^[a-f0-9]{40}$/.test(requestedPreparation.sha) ? requestedPreparation.sha : '',
            remotePushed: requestedPreparation.remotePushed === true,
            previewUrl: typeof requestedPreparation.previewUrl === 'string' ? requestedPreparation.previewUrl.slice(0, 255) : '',
            at: String(requestedPreparation.at || '').slice(0, 60)
        };
    }
    const techStackValidation = stackChanged ? null : (input.techStackValidation === undefined ? existing?.techStackValidation || null : input.techStackValidation);
    const techStackApproval = stackChanged ? null : (input.techStackApproval === undefined ? existing?.techStackApproval || null : input.techStackApproval);
    const requestedServerVerification = stackChanged ? null : (input.techStackServerVerification === undefined ? existing?.techStackServerVerification || null : input.techStackServerVerification);
    // A server smoke check is valid only for the prepared stack's exact revision.
    const techStackServerVerification = techStackPrepared && requestedServerVerification?.status === 'verified' &&
        requestedServerVerification.stackId === techStackId &&
        (requestedServerVerification.companionId || '') === techStackCompanionId &&
        requestedServerVerification.root === techStackPrepared.root &&
        requestedServerVerification.sha === techStackPrepared.sha &&
        requestedServerVerification.branch === techStackPrepared.branch &&
        typeof requestedServerVerification.at === 'string' ? {
          status: 'verified', stackId: techStackId, companionId: techStackCompanionId,
          root: techStackPrepared.root, sha: techStackPrepared.sha,
          branch: techStackPrepared.branch, at: requestedServerVerification.at.slice(0,60)
        } : null;
    return { schema: 4, id, name, techStackId, techStackCompanionId, techStackGeneration, techStackPrepared, techStackValidation, techStackServerVerification, techStackApproval, createdAt: existing?.createdAt || now, updatedAt: now, schedule: normalizeProjectSchedule(input.schedule, existing?.schedule), settings: normalizeSettings(input.settings === undefined ? (existing?.settings || {}) : input.settings) };
}
function projectConfig(project, extensionSettings = {}, globalConfig = { get: (_, fallback) => fallback }) {
    const projectSettings = project?.settings || {};
    const getRaw = (key) => {
        if (!CONNECTION_KEYS.includes(key))
            return undefined;
        const [group, field] = key.split('.');
        if (group === 'jira' && ['baseUrl', 'email'].includes(field))
            return projectSettings.jira?.[field] || projectSettings.atlassian?.[field] || extensionSettings.jira?.[field] || extensionSettings.atlassian?.[field] || '';
        return projectSettings[group]?.[field] || extensionSettings[group]?.[field] || EXTENSION_DEFAULTS[group]?.[field] || '';
    };
    return { get(key, defaultValue) {
            if (key === 'jira.jql') {
                const explicit = projectSettings.jira?.jql;
                if (explicit)
                    return explicit;
                const projectKey = projectSettings.jira?.projectKey || extensionSettings.jira?.projectKey;
                if (projectKey)
                    return `project = "${projectKey}" ORDER BY updated DESC`;
                return extensionSettings.jira?.jql || '';
            }
            if (LEGACY_ALIASES[key])
                return getRaw(LEGACY_ALIASES[key]);
            if (key === 'confluence.baseUrl') {
                const explicit = getRaw(key);
                return explicit || (getRaw('jira.baseUrl') ? getRaw('jira.baseUrl') + '/wiki' : '');
            }
            if (CONNECTION_KEYS.includes(key))
                return getRaw(key);
            return globalConfig.get(key, defaultValue);
        } };
}
class ProjectRegistry {
    constructor(workspacePath) {
        if (!path.isAbsolute(workspacePath))
            throw new Error('Absolute workspace path required.');
        this.workspace = workspacePath;
        this.root = path.join(workspacePath, 'projects');
    }
    fileFor(id) { if (!ID_RE.test(id))
        throw new Error('Invalid project ID.'); return path.join(this.root, id, 'atgv.project.json'); }
    async ensureRoot() {
        let st;
        try {
            st = await fs.lstat(this.root);
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        if (st && (!st.isDirectory() || st.isSymbolicLink()))
            throw new Error('Projects folder must be a real directory, not a symlink.');
        if (!st)
            await fs.mkdir(this.root, { recursive: true });
        st = await fs.lstat(this.root);
        if (!st.isDirectory() || st.isSymbolicLink())
            throw new Error('Projects folder must be a real directory.');
        return this.root;
    }
    async list() {
        let entries;
        try {
            entries = await fs.readdir(this.root, { withFileTypes: true });
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return [];
            throw e;
        }
        const result = [];
        for (const item of entries) {
            if (!item.isDirectory() || !ID_RE.test(item.name))
                continue;
            try {
                result.push(await this.read(item.name));
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
        }
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }
    async unmanagedFolders() {
        let entries;
        try {
            entries = await fs.readdir(this.root, { withFileTypes: true });
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return [];
            throw e;
        }
        const names = entries.filter(entry => entry.isDirectory() && IMPORT_FOLDER_RE.test(entry.name)).map(entry => entry.name);
        const result = [];
        for (const folder of names) {
            const id = folder.toLowerCase(), file = path.join(this.root, folder, 'atgv.project.json');
            let manifest = null, error = '', hasManifest = false;
            try {
                const st = await fs.lstat(file);
                hasManifest = true;
                if (!st.isFile() || st.isSymbolicLink())
                    throw new Error('Project manifest must be a regular file.');
                manifest = JSON.parse(await fs.readFile(file, 'utf8'));
                if (!manifest || !Number.isInteger(manifest.schema) || ![1, 2, 3, 4].includes(manifest.schema) || typeof manifest.id !== 'string' || manifest.id.toLowerCase() !== id || !manifest.name)
                    throw new Error('Existing project manifest does not match this folder.');
                normalizeProjectInput({ ...manifest, id }, { ...manifest, id });
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    error = e.message;
            }
            if (folder === id && manifest && !error)
                continue;
            const duplicate = names.some(name => name !== folder && name.toLowerCase() === id);
            const blocked = Boolean(error || duplicate);
            result.push({ folder, id, name: manifest?.name || folder, hasManifest, blocked, reason: error || (duplicate ? 'Another project folder has the same ID ignoring letter case.' : '') });
        }
        return result.sort((a, b) => a.folder.localeCompare(b.folder));
    }
    async importExistingFolder(folder) {
        if (typeof folder !== 'string' || !IMPORT_FOLDER_RE.test(folder))
            throw new Error('Invalid project folder name.');
        await this.ensureRoot();
        const candidate = (await this.unmanagedFolders()).find(item => item.folder === folder);
        if (!candidate)
            throw new Error('This folder is already registered or cannot be imported. Refresh the project list.');
        if (candidate.blocked)
            throw new Error(candidate.reason);
        const source = path.join(this.root, folder), target = path.join(this.root, candidate.id);
        const st = await fs.lstat(source);
        if (!st.isDirectory() || st.isSymbolicLink())
            throw new Error('Project folder must be a real directory.');
        let old = null;
        if (candidate.hasManifest) {
            old = JSON.parse(await fs.readFile(path.join(source, 'atgv.project.json'), 'utf8'));
            if (old.id.toLowerCase() !== candidate.id)
                throw new Error('Project manifest changed. Refresh and retry.');
        }
        const item = old ? { ...old, id: candidate.id } : normalizeProjectInput({ id: candidate.id, name: folder });
        const normalized = normalizeProjectInput(item, { ...item, id: candidate.id });
        if (old) {
            item.id = candidate.id;
            item.updatedAt = normalized.updatedAt;
        }
        let moved = false;
        if (source !== target) {
            try {
                const existing = await fs.lstat(target);
                if (existing.dev !== st.dev || existing.ino !== st.ino)
                    throw new Error('Destination project folder already exists.');
            }
            catch (e) {
                if (e.code !== 'ENOENT')
                    throw e;
            }
            await fs.rename(source, target);
            moved = true;
        }
        const config = path.join(target, 'atgv.project.json');
        try {
            if (old) {
                const tmp = config + '.import-' + process.pid + '.tmp';
                await fs.writeFile(tmp, JSON.stringify(item, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
                try {
                    await fs.rename(tmp, config);
                }
                catch (e) {
                    await fs.rm(tmp, { force: true });
                    throw e;
                }
            }
            else
                await fs.writeFile(config, JSON.stringify(item, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            return await this.read(candidate.id);
        }
        catch (e) {
            if (moved)
                await fs.rename(target, source).catch(() => { });
            throw e;
        }
    }
    async read(id) {
        const file = this.fileFor(id);
        for (const p of [this.root, path.dirname(file), file]) {
            const st = await fs.lstat(p);
            if (st.isSymbolicLink())
                throw new Error('ATGV project paths must not be symbolic links.');
        }
        const item = JSON.parse(await fs.readFile(file, 'utf8'));
        if (item.id !== id || ![1, 2, 3, 4].includes(item.schema))
            throw new Error(`Invalid project settings for ${id}.`);
        normalizeProjectInput(item, item);
        return item;
    }
    async create(input) {
        const item = normalizeProjectInput(input);
        const dir = path.dirname(this.fileFor(item.id));
        await this.ensureRoot();
        const folders = await fs.readdir(this.root);
        if (folders.some(name => name.toLowerCase() === item.id)) {
            const error = new Error(`Project folder ${item.id} already exists (folder names are case-insensitive). Import the existing folder instead.`);
            error.code = 'EEXIST';
            throw error;
        }
        await fs.mkdir(dir);
        try {
            await fs.writeFile(this.fileFor(item.id), JSON.stringify(item, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        }
        catch (e) {
            await fs.rmdir(dir).catch(() => { });
            throw e;
        }
        return item;
    }
    async update(id, input) {
        const existing = await this.read(id);
        const next = normalizeProjectInput(input, existing);
        const file = this.fileFor(id), tmp = file + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        try {
            await fs.rename(tmp, file);
        }
        catch (e) {
            await fs.rm(tmp, { force: true });
            throw e;
        }
        return next;
    }
    async resetFolder() {
        if (path.basename(this.root) !== 'projects' || path.dirname(this.root) !== this.workspace)
            throw new Error('Unsafe reset target.');
        let st;
        try {
            st = await fs.lstat(this.root);
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return;
            throw e;
        }
        if (!st.isDirectory() || st.isSymbolicLink())
            throw new Error('Refusing reset: projects is not a regular folder.');
        for (const name of await fs.readdir(this.root))
            await fs.rm(path.join(this.root, name), { recursive: true, force: true });
    }
}
module.exports = { projectSlug, parseRepoUrl, normalizeGithubRepository, normalizeExtensionSettings, normalizeProjectInput, normalizeProjectSchedule, projectConfig, ProjectRegistry, EXTENSION_DEFAULTS, validGithubBranch };
