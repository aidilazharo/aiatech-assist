'use strict';
// A short role skill ID must come from the active catalog, not a local role-name
// mapping. Older catalogs provide only roles/<role>/SKILL.md.
const ROLE_ID=/^[a-z][a-z0-9-]{0,79}$/;
const SKILL_ID=/^[a-z][a-z0-9._-]{0,79}$/;
function describe(roleId, markdown, sourcePath) {
  if(!ROLE_ID.test(String(roleId||'')))throw Error('Invalid SDLC role skill ID.');
  const source=sourcePath||`roles/${roleId}/SKILL.md`;
  const escaped=roleId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const valid=new RegExp(`^roles/${escaped}/(?:SKILL\\.md|skills/(?:[a-z][a-z0-9._-]{0,79}\\.md|[a-z][a-z0-9._-]{0,79}/SKILL\\.md))$`,'i');
  if(!valid.test(source))throw Error('Invalid catalog role skill path.');
  const raw=String(markdown||'');
  let id='';
  const frontmatter=/^---\s*\r?\n([\s\S]{0,4096}?)\r?\n---(?:\s*\r?\n|$)/.exec(raw);
  if(frontmatter){
    for(const line of frontmatter[1].split(/\r?\n/)){
      const match=/^\s*(?:id|skill_id|skillId)\s*:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/.exec(line);
      if(match && SKILL_ID.test(match[1])){id=match[1];break;}
    }
  }
  return {id:id||source,source,explicit:!!id};
}
module.exports={describe};
