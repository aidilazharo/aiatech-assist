'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const ROLES = Object.freeze([
    { id: 'business-analyst', label: 'Business Analyst', short: 'BA', stage: 'Discover & Define', icon: 'clipboard', description: 'Define the problem, capture requirements and confirm acceptance criteria.', tasks: [
            { id: 'discovery', label: 'Discovery notes', document: 'requirements/discovery-notes.md', template: 'meeting-minutes.md' },
            { id: 'requirements', label: 'Business requirements', document: 'requirements/business-requirement.md', template: 'business-requirement.md' },
            { id: 'stories', label: 'User stories & acceptance criteria', document: 'requirements/user-stories.md', template: 'user-story.md' },
            { id: 'review', label: 'Stakeholder review completed', note: 'Record stakeholder decision before checking this item' }
        ] },
    { id: 'project-manager', label: 'Project Manager', short: 'PM', stage: 'Plan & Govern', icon: 'calendar', description: 'Plan delivery, manage risks, track dependencies and coordinate gate reviews.', tasks: [
            { id: 'plan', label: 'Project / sprint plan', document: 'development/sprint-plan.md', template: 'sprint-plan.md' },
            { id: 'risks', label: 'Risk and dependency register', document: 'development/risk-register.md', template: 'risk-register.md' },
            { id: 'status', label: 'Project status / meeting minutes', document: 'meetings/project-status.md', template: 'meeting-minutes.md' },
            { id: 'approval', label: 'Delivery gate reviewed', note: 'Local review tracking; does not approve anything in Jira' }
        ] },
    { id: 'solution-architect', label: 'Solution Architect', short: 'SA', stage: 'Design', icon: 'layout', description: 'Choose a technology approach, document interfaces and review architecture.', tasks: [
            { id: 'architecture', label: 'Architecture & design', document: 'architecture/architecture-design.md', template: 'architecture-design.md' },
            { id: 'adr', label: 'Architecture decision record', document: 'architecture/decision-record.md', template: 'decision-record.md' },
            { id: 'techstack', label: 'Technology stack reviewed', document: 'architecture/tech-stack.md', sourceOnly: true },
            { id: 'review', label: 'Design review completed', note: 'Record the review decision in the relevant document' }
        ] },
    { id: 'software-developer', label: 'Developer', short: 'DEV', stage: 'Build', icon: 'code', description: 'Implement reviewed stories, complete code review and attach test evidence.', tasks: [
            { id: 'design', label: 'Technical design notes', document: 'development/technical-design.md', template: 'technical-design.md' },
            { id: 'review', label: 'Pull request / code review evidence', document: 'development/code-review.md', template: 'code-review.md' },
            { id: 'unit', label: 'Unit/component test evidence', document: 'testing/unit-test-results.md', template: 'test-report.md' },
            { id: 'done', label: 'Definition of Done checked', note: 'Record code and CI status before marking complete' }
        ] },
    { id: 'qa-engineer', label: 'QA Engineer', short: 'QA', stage: 'Verify', icon: 'check', description: 'Plan, execute and document test coverage, defects and release quality.', tasks: [
            { id: 'cases', label: 'Test cases & coverage', document: 'testing/test-cases.md', template: 'test-case.md' },
            { id: 'integration', label: 'Integration / contract test report', document: 'testing/integration-results.md', template: 'test-report.md' },
            { id: 'regression', label: 'Regression / E2E test report', document: 'testing/regression-results.md', template: 'test-report.md' },
            { id: 'signoff', label: 'QA readiness recorded', note: 'Local checklist only; does not update a Jira workflow' }
        ] },
    { id: 'product-owner', label: 'Product Owner', short: 'PO', stage: 'Product Strategy', icon: 'target', description: 'Set product priorities and confirm business value.', tasks: [
            { id: 'vision', label: 'Product vision and outcomes', document: 'product/product-vision.md' },
            { id: 'backlog', label: 'Backlog priorities', document: 'product/backlog-priorities.md' },
            { id: 'acceptance', label: 'Business acceptance criteria', document: 'product/acceptance-criteria.md' }
        ] },
    { id: 'scrum-master', label: 'Scrum Master', short: 'SM', stage: 'Agile Delivery', icon: 'repeat', description: 'Facilitate sprint planning, remove blockers and coordinate team delivery.', tasks: [
            { id: 'ceremonies', label: 'Sprint ceremonies', document: 'agile/sprint-ceremonies.md' },
            { id: 'blockers', label: 'Impediments and decisions', document: 'agile/impediments.md' },
            { id: 'retro', label: 'Retrospective actions', document: 'agile/retrospective.md' }
        ] },
    { id: 'ux-designer', label: 'UX / UI Designer', short: 'UX', stage: 'Experience Design', icon: 'pen-tool', description: 'Design accessible user journeys, prototypes and interaction patterns.', tasks: [
            { id: 'journeys', label: 'User journeys and flows', document: 'design/user-journeys.md' },
            { id: 'wireframes', label: 'Wireframes and interaction specs', document: 'design/wireframes.md' },
            { id: 'accessibility', label: 'Usability and accessibility review', document: 'design/accessibility-review.md' }
        ] },
    { id: 'security-engineer', label: 'Security Engineer', short: 'SEC', stage: 'Security Review', icon: 'shield', description: 'Assess threats, security requirements and test evidence.', tasks: [
            { id: 'threat-model', label: 'Threat model', document: 'security/threat-model.md' },
            { id: 'assessment', label: 'Security assessment', document: 'security/security-assessment.md' },
            { id: 'penetration', label: 'Penetration test evidence', document: 'security/penetration-test-report.md' }
        ] },
    { id: 'data-engineer', label: 'Data Engineer / DBA', short: 'DATA', stage: 'Data Design', icon: 'database', description: 'Plan data models, migrations and data-quality checks.', tasks: [
            { id: 'schema', label: 'Data model and schema', document: 'data/data-model.md' },
            { id: 'migration', label: 'Migration and backup plan', document: 'data/migration-plan.md' },
            { id: 'quality', label: 'Data quality and validation', document: 'data/quality-report.md' }
        ] },
    { id: 'uat-tester', label: 'UAT Tester', short: 'UAT', stage: 'Business Validation', icon: 'user-check', description: 'Validate business acceptance scenarios and record sign-off evidence.', tasks: [
            { id: 'scenarios', label: 'UAT scenarios', document: 'testing/uat-scenarios.md' },
            { id: 'results', label: 'UAT execution results', document: 'testing/uat-results.md' },
            { id: 'decision', label: 'Business acceptance decision', document: 'testing/uat-decision.md' }
        ] },
    { id: 'technical-writer', label: 'Technical Writer', short: 'DOC', stage: 'Documentation', icon: 'book-open', description: 'Prepare clear product, developer and user documentation.', tasks: [
            { id: 'guide', label: 'User guide', document: 'documentation/user-guide.md' },
            { id: 'api', label: 'API and developer guide', document: 'documentation/developer-guide.md' },
            { id: 'notes', label: 'Release notes', document: 'documentation/release-notes.md' }
        ] },
    { id: 'operations-support', label: 'Operations / Support', short: 'SUP', stage: 'Operate & Support', icon: 'life-buoy', description: 'Maintain runbooks, incident readiness and post-release support.', tasks: [
            { id: 'runbook', label: 'Operations runbook', document: 'operations/runbook.md' },
            { id: 'incident', label: 'Incident and escalation plan', document: 'operations/incident-plan.md' },
            { id: 'monitoring', label: 'Monitoring and support readiness', document: 'operations/support-readiness.md' }
        ] },
    { id: 'release-manager', label: 'Release / DevOps', short: 'OPS', stage: 'Release', icon: 'rocket', description: 'Prepare deployment, verification, rollback and operational handover.', tasks: [
            { id: 'deployment', label: 'Deployment and rollback plan', document: 'deployment/deployment-plan.md', template: 'deployment-plan.md' },
            { id: 'checklist', label: 'Release readiness checklist', document: 'deployment/release-checklist.md', template: 'release-checklist.md' },
            { id: 'handover', label: 'Operational handover', document: 'deployment/handover.md', template: 'handover.md' },
            { id: 'release', label: 'Release gate reviewed', note: 'Review-only local flag; does not deploy or grant release approval' }
        ] }
]);
const ROLE_BY_ID = new Map(ROLES.map(r => [r.id, r]));
function roleById(id) { const role = ROLE_BY_ID.get(id); if (!role)
    throw new Error('Unknown SDLC role.'); return role; }
function validTask(roleId, taskId) { const task = roleById(roleId).tasks.find(t => t.id === taskId); if (!task)
    throw new Error('Unknown SDLC task.'); return task; }
function projectRoot(registry, projectId) { const file = registry.fileFor(projectId); return path.dirname(file); }
async function safePath(root, relative) {
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(root + path.sep))
        throw new Error('Document path escapes the active project.');
    let parent = root;
    const parts = path.relative(root, resolved).split(path.sep);
    for (const part of parts) {
        parent = path.join(parent, part);
        const st = await fs.lstat(parent).catch(e => { if (e.code === 'ENOENT')
            return null; throw e; });
        if (st?.isSymbolicLink())
            throw new Error('Refusing to follow a project symlink.');
    }
    return resolved;
}
async function readProgress(registry, projectId, roles) {
    const root = projectRoot(registry, projectId);
    const file = await safePath(root, 'sdlc/progress.json');
    let data;
    try {
        data = JSON.parse(await fs.readFile(file, 'utf8'));
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return {};
        throw e;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return {};
    const out = {};
    for (const role of roles) {
        out[role.id] = {};
        for (const task of role.tasks) {
            if (data[role.id]?.[task.id] === true)
                out[role.id][task.id] = true;
        }
    }
    return out;
}
async function workState(registry, projectId) {
    if (!registry || !projectId)
        return { roles: ROLES, progress: {}, files: {} };
    const { loadProjectRoles } = require('./sdlc-catalog');
    const roles = await loadProjectRoles(registry, projectId);
    const root = projectRoot(registry, projectId), progress = await readProgress(registry, projectId, roles), files = {};
    for (const role of roles) {
        files[role.id] = {};
        for (const task of role.tasks) {
            if (task.document) {
                const file = await safePath(root, 'documents/' + task.document);
                files[role.id][task.id] = await fs.stat(file).then(s => s.isFile()).catch(e => { if (e.code === 'ENOENT')
                    return false; throw e; });
            }
        }
    }
    const handoffProgress = await require('./handoff-progress').read(registry, projectId);
    const readiness = await require('./role-readiness').roleReadiness(registry, projectId, progress, handoffProgress);
    return { roles, progress, handoffProgress, files, readiness };
}
async function toggleTask(registry, projectId, roleId, taskId, completed) {
    const roles = await require('./sdlc-catalog').loadProjectRoles(registry, projectId);
    const task = roles.find(r => r.id === roleId)?.tasks.find(t => t.id === taskId);
    if (!roles.some(r => r.id === roleId))
        throw Error('Unknown SDLC role.');
    if (!task)
        throw Error('Unknown SDLC task.');
    const root = projectRoot(registry, projectId);
    if (completed && task.document) {
        const file = await safePath(root, 'documents/' + task.document);
        const exists = await fs.stat(file).then(s => s.isFile()).catch(e => { if (e.code === 'ENOENT')
            return false; throw e; });
        if (!exists)
            throw new Error('Create the required document before marking this task complete.');
    }
    const progress = await readProgress(registry, projectId, roles);
    progress[roleId] ??= {};
    progress[roleId][taskId] = Boolean(completed);
    const directory = await safePath(root, 'sdlc');
    await fs.mkdir(directory, { recursive: true });
    const file = await safePath(root, 'sdlc/progress.json'), tmp = await safePath(root, 'sdlc/progress.json.tmp');
    await fs.writeFile(tmp, JSON.stringify(progress, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    try {
        await fs.rename(tmp, file);
    }
    catch (e) {
        await fs.rm(tmp, { force: true });
        throw e;
    }
    return progress;
}
async function openTaskDocument(registry, projectId, roleId, taskId, vscode, extensionRoot) {
    const roles = await require('./sdlc-catalog').loadProjectRoles(registry, projectId);
    const task = roles.find(r => r.id === roleId)?.tasks.find(t => t.id === taskId);
    if (!roles.some(r => r.id === roleId))
        throw Error('Unknown SDLC role.');
    if (!task)
        throw Error('Unknown SDLC task.');
    if (!task.document)
        throw new Error('This review item does not have an associated document.');
    const root = projectRoot(registry, projectId), file = await safePath(root, 'documents/' + task.document);
    const parent = path.dirname(file);
    await fs.mkdir(parent, { recursive: true });
    if (task.template) {
        let content;
        try {
            const resolved = await safePath(path.join(registry.workspace, '.atgv', 'library'), path.join('templates', task.template));
            content = await fs.readFile(resolved, 'utf8');
        }
        catch (e) {
            if (e.code !== 'ENOENT') throw e;
            // One last read-only fallback for workspaces not yet migrated by Start.
            try {
                const legacy=await safePath(path.join(registry.workspace,'.atgv'),path.join('templates',task.template));
                content=await fs.readFile(legacy,'utf8');
            } catch (legacyError) {
                if(legacyError.code!=='ENOENT') throw legacyError;
                content=await fs.readFile(path.join(extensionRoot,'resources','defaults','templates',task.template),'utf8');
            }
        }
        await fs.writeFile(file, content, { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST')
            throw e; });
    }
    else {
        const exists = await fs.stat(file).then(s => s.isFile()).catch(e => { if (e.code === 'ENOENT')
            return false; throw e; });
        if (!exists)
            await fs.writeFile(file, '# ' + task.label + '\n\n## Purpose\n\nTBD\n\n## Details\n\nTBD\n', { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST')
                throw e; });
    }
    if (vscode)
        await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
    return file;
}
module.exports = { ROLES, roleById, workState, toggleTask, openTaskDocument };
