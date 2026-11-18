'use strict';
const FIXED_LIBRARY_REPOSITORY='https://github.com/aidilazharo/tech-stacks-skills';
const DEFAULTS=Object.freeze({
 jiraUrl:'https://aiamy-jira-azure.atlassian.net',
 confluenceUrl:'https://aiamy-jira-azure.atlassian.net/wiki',
 email:'user.name@aia.com',
 githubUrl:'https://github.com/aiamalaysia'
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
  if(key==='confluenceUrl'){
   if(!['','/wiki'].includes(url.pathname.replace(/\/$/,'')))throw Error('Confluence URL must be the site base URL or end in /wiki.');
   data[key]=url.origin+'/wiki';
  }
 }
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw Error('Enter a valid Jira and Confluence account email.');
 const organization=new URL(data.githubUrl);
 if(organization.protocol!=='https:'||organization.hostname!=='github.com'||organization.search||organization.hash||organization.username||organization.password||!/^\/[A-Za-z0-9_.-]+\/?$/.test(organization.pathname))throw Error('Enter a GitHub organization URL.');
 const owner=organization.pathname.split('/').filter(Boolean)[0];
 // Library identity is fixed by ATGV, regardless of the configured account owner.
 const library=githubRepo(FIXED_LIBRARY_REPOSITORY);
 return {...data,owner,libraryRepoUrl:FIXED_LIBRARY_REPOSITORY,library};
}
module.exports={DEFAULTS,FIXED_LIBRARY_REPOSITORY,githubRepo,validate};
