'use strict';
function projectHealth(project, work = {}, today) {
    const schedule = project?.schedule || {}, start = schedule.startDate || '', end = schedule.endDate || '';
    const date = today || (() => { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-'); })();
    const roles = Array.isArray(work.roles) ? work.roles : [];
    const tasks = roles.flatMap(role => (role.tasks || []).map(task => ({ roleId: role.id, taskId: task.id })));
    const completed = tasks.filter(task => work.progress?.[task.roleId]?.[task.taskId] === true).length;
    const total = tasks.length;
    const percent = total ? Math.round(completed / total * 100) : 0;
    const result = { label: 'Not Scheduled', tone: 'neutral', startDate: start, endDate: end, completed, total, percent, expectedPercent: 0 };
    if (total && completed === total)
        return { ...result, label: 'Completed', tone: 'success', expectedPercent: 100 };
    if (!start || !end)
        return completed ? { ...result, label: 'In Progress', tone: 'info' } : result;
    const day = value => Date.parse(value + 'T00:00:00Z') / 86400000;
    const current = day(date), first = day(start), last = day(end);
    if (!Number.isFinite(current))
        return result;
    if (current < first)
        return { ...result, label: completed ? 'In Progress' : 'Not Started', tone: completed ? 'info' : 'neutral' };
    if (current > last)
        return { ...result, label: 'Delayed', tone: 'error', expectedPercent: 100 };
    const expectedPercent = Math.min(100, Math.max(0, Math.round((current - first + 1) / (last - first + 1) * 100)));
    if (percent + 15 < expectedPercent)
        return { ...result, label: 'At Risk', tone: 'warning', expectedPercent };
    if (percent === 0 && expectedPercent <= 15)
        return { ...result, label: 'In Progress', tone: 'info', expectedPercent };
    return { ...result, label: 'On Track', tone: 'success', expectedPercent };
}
module.exports = { projectHealth };
