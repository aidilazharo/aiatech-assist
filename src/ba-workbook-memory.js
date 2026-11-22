'use strict';

const workbook = Object.freeze({
 source: 'TRM_Application_Req.xlsx',
 sha256: 'ea40df50d6b5efa440c6102bef138d12ae9cd3264617aa26a3211c844d39b358',
 sheets: ['Jira Import','Definition of Done','Decisions','Open Questions','Scope'],
 issueCounts: { Epic: 2, Story: 21, 'Sub-task': 51 }
});

function generationGuidance() {
 return [
  'Business Analyst reference memory — '+workbook.source+' (generalized writing guidance).',
  'Group independently testable business outcomes into epics and user-facing stories. Give each story a clear actor, need and benefit. Use linked subtasks for implementation and verification details supported by the current source.',
  'Write issue-specific acceptance criteria using Given / When / Then. Cover the main outcome, applicable exceptions, authorization, and source-stated boundary cases. Preserve confirmed decisions and label open questions or unspecified limits explicitly.',
  'Write a Definition of Done checklist with observable completion evidence. Include relevant positive and negative verification, review, and applicable contract, data, permission, accessibility or documentation checks. Add numerical targets or mandated standards only when the current project evidence or an approved project template requires them.',
  'Use the example workbook for format and quality guidance. Derive business rules, implementation details and decisions solely from active project evidence. Keep Jira issue IDs and custom field configuration specific to the selected Jira project.'
 ].join('\n');
}

module.exports = {workbook, generationGuidance};
