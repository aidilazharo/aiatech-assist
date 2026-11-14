/* Project Manager read-only delivery calculations. Shared by the VS Code webview and tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ATGVPMDelivery = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DONE_NAMES = /^(done|closed|resolved|completed|cancelled|canceled)$/i;
  const BLOCKED_NAMES = /\b(blocked|impeded|on hold|waiting for dependency)\b/i;
  const DAY_MS = 86400000;
  function dateOnly(value) {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value || ''));
    if (!match) return '';
    const date = new Date(match[1] + 'T00:00:00Z');
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10) === match[1] ? match[1] : '';
  }
  function isDone(item) {
    return item?.statusCategory === 'done' || !!item?.resolution || DONE_NAMES.test(String(item?.status || ''));
  }
  function isBlocked(item) {
    return !isDone(item) && (item?.blocked === true || BLOCKED_NAMES.test(String(item?.status || '')));
  }
  function state(item, nowDate) {
    const today = dateOnly(nowDate) || new Date().toISOString().slice(0,10);
    const due = dateOnly(item?.dueDate);
    const complete = isDone(item);
    const overdue = !complete && !!due && due < today;
    const days = due ? Math.round((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / DAY_MS) : null;
    const dueSoon = !complete && days !== null && days >= 0 && days <= 7;
    return {done:complete, blocked:isBlocked(item), overdue, dueSoon, daysUntilDue:days};
  }
  function priorityValue(priority) {
    const text = String(priority || '').toLowerCase();
    return /highest|blocker|critical/.test(text) ? 0 : /high/.test(text) ? 1 : /medium|normal/.test(text) ? 2 : /low/.test(text) ? 3 : 4;
  }
  function analyze(items, today) {
    const list = Array.isArray(items) ? items : [];
    const annotated = list.map(item => ({...item, pmState:state(item,today)}));
    const active = annotated.filter(item=>!item.pmState.done);
    const queue = active.filter(item => item.pmState.blocked || item.pmState.overdue || item.pmState.dueSoon)
      .sort((a,b)=>{
        const rank = x => x.pmState.blocked ? 0 : x.pmState.overdue ? 1 : 2;
        return rank(a)-rank(b) || priorityValue(a.priority)-priorityValue(b.priority) ||
          (a.dueDate||'9999').localeCompare(b.dueDate||'9999') || String(a.key).localeCompare(String(b.key));
      });
    const people = new Map();
    for (const item of annotated) {
      const key = item.assigneeId || (item.assignee ? 'name:' + item.assignee : 'unassigned');
      if (!people.has(key)) people.set(key,{key,name:item.assignee||'Unassigned',total:0,open:0,overdue:0,blocked:0});
      const person=people.get(key); person.total++;
      if(!item.pmState.done)person.open++;
      if(item.pmState.overdue)person.overdue++;
      if(item.pmState.blocked)person.blocked++;
    }
    const workload=[...people.values()].sort((a,b)=>b.overdue-a.overdue||b.blocked-a.blocked||b.open-a.open||a.name.localeCompare(b.name));
    return {total:annotated.length,completed:annotated.length-active.length,open:active.length,
      overdue:active.filter(item=>item.pmState.overdue).length,
      blocked:active.filter(item=>item.pmState.blocked).length,
      dueSoon:active.filter(item=>item.pmState.dueSoon).length,
      completionPercent:list.length?Math.round(100*(list.length-active.length)/list.length):null,
      items:annotated,queue,workload};
  }
  function milestones(tasks, today) {
    const date=dateOnly(today)||new Date().toISOString().slice(0,10);
    return (Array.isArray(tasks)?tasks:[]).map(item=>{
      const progress=Number(item?.progress);
      const percent=Number.isFinite(progress)?Math.min(100,Math.max(0,Math.round(progress))):0;
      const end=dateOnly(item?.end);
      return {id:String(item?.id||''),label:String(item?.label||item?.id||'Milestone'),start:dateOnly(item?.start),end,
        percent,late:!!end&&end<date&&percent<100};
    });
  }
  return {dateOnly,isDone,isBlocked,state,analyze,milestones};
});
