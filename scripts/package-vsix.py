from pathlib import Path
from xml.sax.saxutils import escape, quoteattr
import json, zipfile, re

root=Path(__file__).resolve().parent.parent
pkg=json.loads((root/'package.json').read_text())
identifier=pkg['publisher']+'.'+pkg['name']
semver=pkg['version']
parts=semver.split('.')
if len(parts)!=3 or any(not x.isdigit() or str(int(x))!=x or not 0<=int(x)<=99 for x in parts):
    raise SystemExit('Invalid VSIX version; each SemVer part must be an integer 0..99 with no leading zeros')
expected=f'{parts[0]}.{int(parts[1])}.{int(parts[2]):02d}'
if pkg.get('atgvDisplayVersion')!=expected:
    raise SystemExit('Display version does not match normalized SemVer version')
xml=f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Id={quoteattr(pkg['name'])} Version={quoteattr(semver)} Language="en-US" Publisher={quoteattr(pkg['publisher'])} />
    <DisplayName>{escape(pkg['displayName'])}</DisplayName>
    <Description xml:space="preserve">{escape(pkg['description'])}</Description>
    <Tags>ATGV, Jira, Confluence, GitHub, RAG</Tags>
    <Categories>Other</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value={quoteattr(pkg['engines']['vscode'])} />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" Version="[1.94.0,)" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Code.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Code.Icon" Path="extension/assets/icon.png" Addressable="true" />
  </Assets>
</PackageManifest>
'''

MIME={
  'json':'application/json','js':'application/javascript','css':'text/css',
  'md':'text/markdown','svg':'image/svg+xml','png':'image/png',
  'xml':'application/xml','vsixmanifest':'text/xml','yaml':'text/plain',
  'html':'text/html','txt':'text/plain','gif':'image/gif',
  'ttf':'font/ttf','woff':'font/woff','woff2':'font/woff2',
  'ico':'image/x-icon','jpg':'image/jpeg','jpeg':'image/jpeg',
  'webp':'image/webp','eot':'application/vnd.ms-fontobject',
  'map':'application/json',
}



files=['package.json','README.md']
for folder in ('src', 'assets', 'media', 'resources', 'design-system'):
    files += sorted(p.relative_to(root).as_posix() for p in (root/folder).rglob('*')
                    if p.is_file() and p.name not in ('README.md', 'CHANGELOG.md', '.DS_Store'))

files += ['service/server.js', 'scripts/create-service-user.js']
files += sorted(p.relative_to(root).as_posix() for p in (root/'service'/'ai').rglob('*.js'))
files=list(dict.fromkeys(files))
for name in files:
    if not (root/name).is_file(): raise SystemExit(f'Expected VSIX file missing: {name}')



for name in files:
    if not name.endswith('.js'): continue
    content=(root/name).read_text(encoding='utf-8')
    for dependency in re.findall(r"\brequire\s*\(\s*['\"](\.{1,2}/[^'\"]+)['\"]\s*\)", content):
        resolved=(root/name).parent/dependency
        possible=[resolved, Path(str(resolved)+'.js'), Path(str(resolved)+'.json'), resolved/'index.js']
        if not any(p.is_file() and p.resolve().is_relative_to(root) and p.resolve().relative_to(root).as_posix() in files for p in possible):
            raise SystemExit(f'VSIX missing local dependency: {name} -> {dependency}')

used={Path(f).suffix.lstrip('.').lower() for f in files if Path(f).suffix}
content_types=['<?xml version="1.0" encoding="utf-8"?>',
               '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">']
for suffix in sorted(used|{'vsixmanifest'}):
    content_types.append(f'<Default Extension={quoteattr(suffix)} ContentType={quoteattr(MIME.get(suffix,"application/octet-stream"))} />')

for name in files:
    if not Path(name).suffix:
        content_types.append(f'<Override PartName={quoteattr("/extension/"+name)} ContentType="text/plain" />')
content_types.append('</Types>')
types='\n'.join(content_types)+'\n'
output=root.parent/f'{pkg["name"]}-{semver}.vsix'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    z.writestr('[Content_Types].xml',types)
    z.writestr('extension.vsixmanifest',xml)
    for name in files:z.write(root/name,'extension/'+name)
print(f'Created: {output} ({output.stat().st_size:,} bytes) as {identifier}')
