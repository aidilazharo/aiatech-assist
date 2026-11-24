'use strict';
// Installed ATGV uses the approved AIA Malaysia distribution repositories.
const DEFAULTS=Object.freeze({
 jiraUrl:'https://aiamy-jira-azure.atlassian.net',
 email:'user.name@aia.com',
 githubUrl:'github.com/aiamalaysia',
 projectRepository:'my-fow-technology-app-techassists'
});
const RELEASES=Object.freeze({
 extension:'https://github.com/aiamalaysia/my-fow-technology-app-techassists-dev-sdlc',
 library:'https://github.com/aiamalaysia/my-fow-technology-app-techassists-enterprise-skills'
});
const FIXED_LIBRARY_REPOSITORY=RELEASES.library;
// Preserve existing account onboarding compatibility, but never route software to the legacy owner.
const SOURCE_REPOS=Object.freeze({aidilazharo:RELEASES,aiamalaysia:RELEASES});
function githubRepo(input){
 const url=new URL(String(input||'').trim());
 if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.search||url.hash)throw Error('GitHub repository must use https://github.com/owner/repository.');
 const names=url.pathname.replace(/\/$/,'').split('/').filter(Boolean);
 if(names.length!==2||!names.every(name=>/^[A-Za-z0-9_.-]+$/.test(name)))throw Error('Invalid GitHub repository URL.');
 return {owner:names[0],repo:names[1].replace(/\.git$/,'')};
}
function githubOrganization(input){
 const raw=String(input||'').trim();
 const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
 if(url.protocol!=='https:'||url.hostname!=='github.com'||url.port||url.search||url.hash||url.username||url.password||
 !/^\/[A-Za-z0-9-]{1,39}\/?$/.test(url.pathname))throw Error('Use github.com/organization, without a repository or credentials.');
 const owner=url.pathname.split('/').filter(Boolean)[0];
 return {owner,url:'https://github.com/'+owner};
}
function validate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid startup connection form.');
 const jiraUrl=String(input.jiraUrl||input.atlassianUrl||'').trim();
 const email=String(input.email||'').trim();
 const org=githubOrganization(input.githubUrl);
 const projectRepository=String(input.projectRepository||DEFAULTS.projectRepository).trim();
 if(!jiraUrl||jiraUrl.length>500||!email||email.length>250)throw Error('Enter Atlassian URL and Atlassian email.');
 const site=new URL(jiraUrl);
 if(site.protocol!=='https:'||site.username||site.password||site.port||site.search||site.hash||
 !site.hostname.endsWith('.atlassian.net')||site.pathname.replace(/\/$/,'')!=='')
 throw Error('Enter a valid Atlassian site URL (https://your-site.atlassian.net).');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid Atlassian email address.');
 if(!/^[A-Za-z0-9_.-]{1,100}$/.test(projectRepository)||projectRepository.startsWith('.')||projectRepository.endsWith('.git'))
 throw Error('Enter a valid Project Repository name, without organization or https://.');
 const selected=SOURCE_REPOS[org.owner.toLowerCase()];
 if(!selected)throw Error('ATGV extension/library mapping is not configured for '+org.owner+'. Supported GitHub owners: aidilazharo or aiamalaysia.');
 const library=githubRepo(selected.library),extension=githubRepo(selected.extension);
 return {
  jiraUrl:site.origin,confluenceUrl:site.origin+'/wiki',email,githubUrl:org.url,owner:org.owner,
  projectRepository,projectRepoUrl:org.url+'/'+projectRepository,
  extensionRepoUrl:selected.extension,libraryRepoUrl:selected.library,
  extension,library,extensionReleases:githubRepo(RELEASES.extension),
  libraryReleases:githubRepo(RELEASES.library),extensionReleasesUrl:RELEASES.extension,libraryReleasesUrl:RELEASES.library
 };
}
module.exports={DEFAULTS,FIXED_LIBRARY_REPOSITORY,SOURCE_REPOS,RELEASES,githubRepo,githubOrganization,validate};
