'use strict';
const DEFAULTS=Object.freeze({
 jiraUrl:'https://aiamy-jira-azure.atlassian.net',
 confluenceUrl:'https://aiamy-jira-azure.atlassian.net/wiki',
 email:'user.name@aia.com',
 githubUrl:'https://github.com/aiamalaysia',
 projectRepoUrl:'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-cockpit',
 libraryRepoUrl:'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills'
});
function githubRepo(input){
 const url=new URL(String(input||'').trim());
 if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.search||url.hash)throw Error('GitHub repository must use https://github.com/owner/repository.');
 const path=url.pathname.replace(/\/$/,'').split('/').filter(Boolean);
 if(path.length!==2||!path.every(p=>/^[A-Za-z0-9_.-]+$/.test(p)))throw Error('Invalid GitHub repository URL.');
 return {owner:path[0],repo:path[1].replace(/\.git$/,'')};
}
function validate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid startup connection form.');
 const data={};for(const key of Object.keys(DEFAULTS)){
  const value=String(input[key]||'').trim();
  if(!value||value.length>600)throw Error('Enter '+key+' before testing connections.');
  data[key]=value;
 }
 for(const key of ['jiraUrl','confluenceUrl']){
  const url=new URL(data[key]);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.atlassian.net'))throw Error('Enter a secure Atlassian Cloud URL for '+key+'.');
  if(key==='jiraUrl'&&url.pathname.replace(/\/$/,'')!=='')throw Error('Jira URL must be the site base URL.');
  if(key==='confluenceUrl'&&url.pathname.replace(/\/$/,'')!=='/wiki')throw Error('Confluence URL must end in /wiki.');
 }
 if(new URL(data.jiraUrl).origin!==new URL(data.confluenceUrl).origin)throw Error('Jira and Confluence must share the same Atlassian site to use one account token.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw Error('Enter a valid Jira and Confluence account email.');
 const organization=new URL(data.githubUrl);
 if(organization.protocol!=='https:'||organization.hostname!=='github.com'||organization.search||organization.hash||organization.username||organization.password||!/^\/[A-Za-z0-9_.-]+\/?$/.test(organization.pathname))throw Error('Enter a GitHub organization URL.');
 const owner=organization.pathname.split('/').filter(Boolean)[0];
 const project=githubRepo(data.projectRepoUrl),library=githubRepo(data.libraryRepoUrl);
 if(project.owner.toLowerCase()!==owner.toLowerCase()||library.owner.toLowerCase()!==owner.toLowerCase())throw Error('Project and library repositories must belong to the selected GitHub organization.');
 return {...data,owner,project,library};
}
module.exports={DEFAULTS,githubRepo,validate};
