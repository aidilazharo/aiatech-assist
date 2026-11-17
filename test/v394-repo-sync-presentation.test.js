'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const sync=require('../src/repo-sync-pr');

test('generated and inherited branch suggestions do not end with commit hashes',()=>{
 const sha='ecca6b50'.repeat(5);
 assert.equal(sync.branchName('repo',sha,'feat: add Jira issue details to preview'),
  'feat/add-jira-issue-details-to-preview');
 assert.equal(sync.stripCommitHashSuffix('feat/add-jira-issue-details-preview-ecca6b50',sha),
  'feat/add-jira-issue-details-preview');
 assert.equal(sync.stripCommitHashSuffix('fix/old-change-9876abcd',sha),'fix/old-change');
 assert.equal(sync.stripCommitHashSuffix('fix/old-change-9876abc',sha),'fix/old-change');
 assert.equal(sync.stripCommitHashSuffix('fix/issue-12345678',sha),'fix/issue-12345678');
 const plan=sync.aiSyncPlan({branch:'feat/add-jira-preview-ecca6b50',commitMessage:'feat: add jira api',
  prTitle:'add github and jira preview',prDescription:'Add preview.\n2. Include acceptance criteria.'},
  {repo:'repo'},'feat: add Jira preview',sha);
 assert.equal(plan.branch,'feat/add-jira-preview');
 assert.equal(plan.commitMessage,'feat: Add Jira API');
 assert.equal(plan.prTitle,'Add GitHub and Jira preview');
 assert.equal(plan.prDescription,'- Add preview.\n- Include acceptance criteria.');
});

test('readable commit and title capitalization preserves identifiers, links and commit bodies',()=>{
 const body='fix: improve github jira api and ui/ux in `jira-settings.json`\n\nKeep this body as entered.';
 assert.equal(sync.formatCommitMessage(body),
  'fix: Improve GitHub Jira API and UI/UX in `jira-settings.json`\n\nKeep this body as entered.');
 assert.equal(sync.formatSubject('show vite and typescript for react'),
  'Show Vite and TypeScript for React');
 assert.equal(sync.formatSubject('inspect src/jira/api.js and https://github.com/a/repo'),
  'Inspect src/jira/api.js and https://github.com/a/repo');
});

test('PR descriptions use at most ten points and edited review values are validated',()=>{
 const input='## Summary\n'+Array.from({length:12},(_,i)=>(i+1)+'. Item '+(i+1)).join('\n');
 const result=sync.formatPrDetails(input).split('\n');
 assert.equal(result.length,10);
 assert.equal(result[0],'- Item 1');
 assert.equal(result[9],'- Item 10');
 const review={branch:'fix/jira-preview',prDescription:result.join('\n')};
 assert.doesNotThrow(()=>sync.validateReviewPresentation(review,'ecca6b50'.repeat(5)));
 assert.throws(()=>sync.validateReviewPresentation({...review,branch:review.branch+'-ecca6b50'},'ecca6b50'.repeat(5)),/trailing commit hash/);
 assert.throws(()=>sync.validateReviewPresentation({...review,prDescription:'A sentence.'},''),/bullet points/);
 assert.throws(()=>sync.validateReviewPresentation({...review,prDescription:result.concat('- Extra').join('\n')},''),/maximum of 10/);
});
