'use strict';
const brWorkflow = require('./br-workflow');
const { getRoleSettings } = require('./sdlc-catalog');
function calculateReadiness(settings, progress, register, handoffProgress = {}) {
    const enabled = new Set(settings.enabled), roles = settings.roles.filter(r => enabled.has(r.id));
    const items = brWorkflow.plan(register);
    const unfinished = new Set(items.filter(x => x.action === 'create' || x.action === 'update' || x.action === 'retire').map(x => x.path.split('/')[0]));
    const requirements = (register.brs || []).filter(x => x.status !== 'retired').map(br => {
        const synced = register.synced?.[br.id];
        const approved = br.status === 'approved' && !br.needsRefresh && !br.externalReviewRequired && !br.roleReviewRequired && !br.dependencyReviewRequired && !!br.approvedContent;
        const published = approved && !!synced && !unfinished.has(br.id);
        return { id: br.id, title: br.title, revision: br.approvedRevision || 0, jiraKey: synced?.key || null, status: !approved ? (br.approvedContent ? 'change-review' : 'blocked') : published ? 'ready' : 'awaiting-jira', published };
    });
    const byId = new Map(roles.map(r => [r.id, r]));
    const complete = (id, requirement) => {
        const role = byId.get(id);
        if (!role || !role.tasks.length)
            return false;
        const scoped = dependsOnBA(id, settings.dependencies || {}, new Set()) && requirement.id !== 'project';
        const saved = scoped ? handoffProgress[id + '|' + requirement.id] : null;
        const tasks = scoped ? (saved?.revision === requirement.revision ? saved.tasks : {}) : progress[id];
        return role.tasks.every(t => tasks?.[t.id] === true);
    };
    const handoffs = [];
    for (const role of roles) {
        const dependencies = settings.dependencies?.[role.id] || [];
        const requiresBA = role.id !== 'business-analyst' && dependsOnBA(role.id, settings.dependencies || {}, new Set());
        const list = requiresBA ? requirements : [{ id: 'project', title: 'Project work', revision: 0, status: 'ready', published: true }];
        const rows = [];
        for (const requirement of list) {
            const blockers = [];
            if (requiresBA && !requirement.published)
                blockers.push(requirement.status === 'change-review' ? 'Revised BR requires approval and JIRA sync' : requirement.status === 'awaiting-jira' ? 'Publish approved BR to JIRA' : 'BR approval required');
            for (const dep of dependencies) {
                if (!enabled.has(dep)) {
                    blockers.push('Enable ' + (settings.roles.find(x => x.id === dep)?.label || dep));
                    continue;
                }
                if (dep === 'business-analyst')
                    continue;
                if (!complete(dep, requirement))
                    blockers.push((settings.roles.find(x => x.id === dep)?.label || dep) + ' not complete');
            }
            if (requiresBA && !requirements.length)
                blockers.push('No approved Business Requirements');
            const status = blockers.length ? 'blocked' : complete(role.id, requirement) ? 'completed' : 'ready';
            rows.push({ id: role.id + '-' + requirement.id, roleId: role.id, brId: requirement.id, brTitle: requirement.title, brRevision: requirement.revision, jiraKey: requirement.jiraKey, status, blockers });
        }
        handoffs.push({ roleId: role.id, label: role.label, ready: rows.filter(x => x.status === 'ready').length, blocked: rows.filter(x => x.status === 'blocked').length, completed: rows.filter(x => x.status === 'completed').length, items: rows });
    }
    return { handoffs, summary: { ready: handoffs.reduce((n, x) => n + x.ready, 0), blocked: handoffs.reduce((n, x) => n + x.blocked, 0) }, sourceRevision: register.revision };
}
function dependsOnBA(id, deps, seen) {
    if (id === 'business-analyst')
        return true;
    if (seen.has(id))
        return false;
    seen.add(id);
    return (deps[id] || []).some(d => dependsOnBA(d, deps, seen));
}
async function roleReadiness(registry, projectId, progress, handoffProgress) {
    if (!registry || !projectId)
        return { handoffs: [], summary: { ready: 0, blocked: 0 } };
    const [settings, register] = await Promise.all([getRoleSettings(registry, projectId), brWorkflow.load(registry, projectId)]);
    return calculateReadiness(settings, progress, register, handoffProgress);
}
module.exports = { calculateReadiness, roleReadiness, dependsOnBA };
