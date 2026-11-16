'use strict';
// Read-only Jira and Confluence refresh policy. Publishing/approvals are never implied.
const INTERVAL_MS=5*60*1000;
const MIN_RETRY_MS=60*1000;
function configState(config){
 const get=name=>String(config?.get?.(name)||'').trim();
 const key=get('jira.projectKey').toUpperCase();
 const jira=!!get('jira.baseUrl')&&!!(get('jira.jql')||/^[A-Z][A-Z0-9_]{0,29}$/.test(key));
 const confluence=!!get('confluence.baseUrl')&&!!(get('confluence.spaceKey')||get('confluence.spaceId'))||!!get('jira.baseUrl')&&!!(get('confluence.spaceKey')||get('confluence.spaceId'));
 return {jira,confluence};
}
function jiraConfig(config){
 const configured=String(config.get('jira.jql')||'').trim();
 if(configured)return config;
 const key=String(config.get('jira.projectKey')||'').trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9_]{0,29}$/.test(key))throw Error('Configure a valid Jira Project Key or scoped JQL before refreshing.');
 return {get:name=>name==='jira.jql'?'project = '+key+' ORDER BY updated DESC':config.get(name)};
}
function canRefresh({now=Date.now(),lastAttempt=0,busy=false,force=false,offline=false}={}){
 if(offline||busy)return false;
 return force||now-lastAttempt>=MIN_RETRY_MS;
}
function formatStatus(status){
 if(!status?.projectId)return 'Open a project to fetch live Jira and Confluence data.';
 const successes=Object.entries(status.results||{}).map(([name,n])=>name+': '+n+' fetched');
 const failures=Object.entries(status.errors||{}).map(([name,message])=>name+': unavailable ('+String(message).slice(0,120)+')');
 if(status.phase==='running')return 'Refreshing live Jira and Confluence data…';
 if(status.phase==='offline')return 'Offline mode: local cached data retained; Jira and Confluence were not contacted.';
 return (successes.length||failures.length?[...successes,...failures].join(' · '):'No connected Jira or Confluence source configured.')+
  (status.lastAttempt?' · Checked '+new Date(status.lastAttempt).toLocaleString():'');
}
module.exports={INTERVAL_MS,MIN_RETRY_MS,configState,jiraConfig,canRefresh,formatStatus};
