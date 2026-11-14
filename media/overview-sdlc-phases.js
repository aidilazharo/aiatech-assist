/* ATGV Overview project SDLC phase aggregation. Local checklist progress only. */
(function (scope) {
  'use strict';
  const PHASES = Object.freeze([
    {id: 'planning', label: 'Planning', roles: ['project-manager', 'product-owner', 'scrum-master']},
    {id: 'requirements', label: 'Requirements', roles: ['business-analyst', 'business-owner', 'compliance-officer']},
    {id: 'design', label: 'Design', roles: ['solution-architect', 'ux-designer', 'data-engineer', 'technical-lead']},
    {id: 'development', label: 'Development', roles: ['software-developer', 'ai-ml-engineer']},
    {id: 'testing', label: 'Testing', roles: ['qa-engineer', 'uat-tester', 'security-engineer']},
    {id: 'deployment', label: 'Deployment', roles: ['release-manager']},
    {id: 'maintenance', label: 'Maintenance', roles: ['operations-support', 'technical-writer']}
  ]);
  function aggregate(roles, progress) {
    const byId = new Map((Array.isArray(roles) ? roles : []).filter(Boolean).map(role => [role.id, role]));
    const saved = progress && typeof progress === 'object' ? progress : {};
    return PHASES.map(phase => {
      let completed = 0, total = 0;
      for (const roleId of phase.roles) {
        const role = byId.get(roleId);
        if (!role) continue;
        for (const task of Array.isArray(role.tasks) ? role.tasks : []) {
          if (!task || typeof task.id !== 'string') continue;
          total++;
          if (saved[roleId]?.[task.id] === true) completed++;
        }
      }
      const percent = total ? Math.round(completed * 100 / total) : 0;
      const state = !total ? 'untracked' : completed === total ? 'complete' : completed ? 'in-progress' : 'not-started';
      return {id: phase.id, label: phase.label, completed, total, percent, state};
    });
  }
  const api = Object.freeze({PHASES, aggregate});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (scope) scope.atgvOverviewSdlcPhases = api;
})(typeof globalThis === 'undefined' ? undefined : globalThis);
