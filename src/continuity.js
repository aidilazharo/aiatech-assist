'use strict';
const { QUESTIONS, assess } = require('./ba-discovery');
function evaluate(answers, { approved = false, documents = null } = {}) {
    const state = assess(answers);
    const tasks = [
        { id: 'requirements', name: 'Business requirements', ready: state.canApprove && approved, blockedBy: !state.canReview ? 'Complete all 12 discovery answers' : state.needsDecision ? 'Resolve open decisions before final approval' : !approved ? 'Human approval required' : null },
        { id: 'planning', name: 'Project planning draft', ready: !!answers.problem && !!answers.scope, blockedBy: !answers.problem || !answers.scope ? 'Business problem and scope required' : null },
        { id: 'architecture', name: 'Architecture proposal', ready: !!answers.targetProcess && !!answers.dependencies && !!answers.constraints, blockedBy: !answers.targetProcess || !answers.dependencies || !answers.constraints ? 'Target process, dependencies and NFRs required' : null },
        { id: 'acceptance-tests', name: 'Acceptance test draft', ready: !!answers.acceptance && !!answers.businessRules, blockedBy: !answers.acceptance || !answers.businessRules ? 'Acceptance criteria and business rules required' : null },
        { id: 'implementation', name: 'Implementation work', ready: state.canApprove && approved, blockedBy: 'Approval and executable architecture checks are required before automatic development' }
    ];
    tasks[4].ready = false;
    if (Array.isArray(documents)) {
        const mapping = { planning: 'project-manager/plan', architecture: 'solution-architect/architecture', 'acceptance-tests': 'qa-engineer/cases' };
        for (const task of tasks) {
            if (task.id === 'requirements' && approved) {
                task.ready = false;
                task.completed = true;
                task.progressStatus = 'approved';
                task.blockedBy = null;
                continue;
            }
            const suffix = mapping[task.id];
            if (!suffix)
                continue;
            const doc = documents.find(d => d.kind === 'role' && d.roleId + '/' + d.taskId === suffix);
            if (!doc)
                continue;
            if (doc.status === 'approved') {
                task.ready = false;
                task.completed = true;
                task.progressStatus = 'approved';
                task.blockedBy = null;
            }
            else if (doc.status === 'draft') {
                task.ready = false;
                task.progressStatus = 'review';
                task.blockedBy = 'Draft exists in SDLC Document Repository; review before approval';
            }
            else
                task.progressStatus = task.ready ? 'ready' : 'blocked';
        }
    }
    return { discovery: state, tasks, ready: tasks.filter(t => t.ready).length, blocked: tasks.filter(t => !t.ready && !t.completed).length, completed: tasks.filter(t => t.completed).length, trigger: 'manual-save', automation: 'recommendations-only' };
}
module.exports = { evaluate };
