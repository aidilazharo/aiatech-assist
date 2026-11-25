from pathlib import Path
from xml.sax.saxutils import escape, quoteattr
import json, zipfile, re, subprocess, tempfile, hashlib

root=Path(__file__).resolve().parent.parent
pkg=json.loads((root/'package.json').read_text())
identifier=pkg['publisher']+'.'+pkg['name']
semver=pkg['version']
parts=semver.split('.')
if len(parts)!=3 or any(not x.isdigit() or str(int(x))!=x or not 0<=int(x)<=99 for x in parts):
    raise SystemExit('Invalid VSIX version; each SemVer part must be an integer 0..99 with no leading zeros')
expected=semver
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
# The GitHub Library main branch provides shared SDLC definitions/templates.
# Do not bundle these replicated assets inside every extension release.
files=[name for name in files if not (name.startswith('resources/defaults/sdlc/') or name.startswith('resources/defaults/templates/'))]
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
# Keep source files untouched. The build-only optimizers emit only modified
# production assets to this isolated staging folder; all others are packaged
# byte-for-byte from source. Node packages never enter the VSIX.
with tempfile.TemporaryDirectory(prefix='atgv-vsix-stage-') as staging:
    stage=Path(staging)
    subprocess.run(['node',str(root/'scripts'/'optimize-vsix-assets.js'),str(stage)],
                   cwd=root,check=True,timeout=180)
    audit=json.loads((stage/'optimization-manifest.json').read_text(encoding='utf-8'))
    modified=set(entry['path'] for entry in audit['files'])
    if not modified.issubset(set(files)):
        raise SystemExit('Optimizer attempted to stage an unexpected VSIX path.')
    for name in files:
        if (root/name).is_symlink():
            raise SystemExit('Symlink cannot be packaged: '+name)
        if name in modified and not (stage/name).is_file():
            raise SystemExit('Optimized VSIX asset missing: '+name)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        z.writestr('[Content_Types].xml',types)
        z.writestr('extension.vsixmanifest',xml)
        for name in files:
            z.write(stage/name if name in modified else root/name,'extension/'+name)

    # If the standard ZIP is over budget, use an optional locally installed
    # Zopfli optimizer for lossless DEFLATE of large members. No network calls.
    budget=json.loads((root/'scripts'/'vsix-size-budget.json').read_text(encoding='utf-8'))
    if output.stat().st_size>budget['maxCompressedBytes']:
        try:
            import zopfli.zlib as zopfli_zlib
        except ImportError:
            print('Optional offline Zopfli unavailable; standard compression retained.')
        else:
            class OfflineDeflate:
                def __init__(self): self.data=bytearray()
                def compress(self,data): self.data.extend(data); return b''
                def flush(self): return zopfli_zlib.compress(bytes(self.data),numiterations=3)[2:-4]
            # zipfile accepts a compression level per entry; reserve 99 here
            # as a build-local sentinel for raw DEFLATE (normal ZIP method 8).
            original_compressor=zipfile._get_compressor
            def compressor(method,level=None):
                return OfflineDeflate() if method==zipfile.ZIP_DEFLATED and level==99 else original_compressor(method,level)
            candidate=stage/'optimized.vsix'
            zipfile._get_compressor=compressor
            try:
                with zipfile.ZipFile(output,'r') as original, zipfile.ZipFile(candidate,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as optimized:
                    for item in original.infolist():
                        optimized.writestr(item,original.read(item),compresslevel=99 if item.compress_size>=20000 else 9)
                with zipfile.ZipFile(output,'r') as original, zipfile.ZipFile(candidate,'r') as optimized:
                    if original.namelist()!=optimized.namelist() or any(original.read(name)!=optimized.read(name) for name in original.namelist()) or optimized.testzip():
                        raise SystemExit('Lossless ZIP optimization verification failed.')
                if candidate.stat().st_size<output.stat().st_size:
                    import shutil
                    shutil.copyfile(candidate,output)
                    audit['zipCompression']='Zopfli raw DEFLATE, large entries; byte-for-byte verified'
            finally:
                zipfile._get_compressor=original_compressor

    # Measure the actual compressed ZIP members, not estimated source bytes.
    with zipfile.ZipFile(output,'r') as z:
        members=[entry for entry in z.infolist() if entry.filename.startswith('extension/')]
        if any(entry.filename.startswith('extension/.memory/') for entry in members):
            raise SystemExit('Release safety policy: .memory must not be included in VSIX')
        details=[{'path':entry.filename[len('extension/'):],
                  'sourceBytes':(root/entry.filename[len('extension/'):]).stat().st_size,
                  'packagedBytes':entry.file_size,
                  'compressedBytes':entry.compress_size}
                 for entry in members]
    budget=json.loads((root/'scripts'/'vsix-size-budget.json').read_text(encoding='utf-8'))
    limit=budget['maxCompressedBytes']
    if not isinstance(limit,int) or limit<500000 or limit>10000000:
        raise SystemExit('Invalid VSIX size budget.')
    zippedBytes=output.stat().st_size
    groups={}
    for item in details:
        name=item['path'].split('/')[0]
        group=groups.setdefault(name,{'files':0,'sourceBytes':0,'packagedBytes':0,'compressedBytes':0})
        group['files']+=1
        for key in ('sourceBytes','packagedBytes','compressedBytes'):
            group[key]+=item[key]
    seen={}
    for item in details:
        p=item['path']
        if item['sourceBytes']>1024:
            digest=hashlib.sha256((root/p).read_bytes()).hexdigest()
            seen.setdefault(digest,[]).append(p)
    duplicates=[{'paths':paths,'sourceBytes':(root/paths[0]).stat().st_size}
                for paths in seen.values() if len(paths)>1]
    report={'schema':1,'version':pkg['version'],
            'vsixBytes':zippedBytes,'sizeBudgetBytes':limit,
            'baselineVersion':budget['baselineVersion'],
            'baselineBytes':budget['baselineBytes'],
            'deltaFromBaselineBytes':zippedBytes-budget['baselineBytes'],
            'sourceFileCount':len(details),
            'originalSourceBytes':sum(d['sourceBytes'] for d in details),
            'packagedSourceBytes':sum(d['packagedBytes'] for d in details),
            'minification':audit,'groups':groups,'duplicates':duplicates,
            'files':sorted(details,key=lambda d:d['compressedBytes'],reverse=True)}
    dist=root/'dist'
    dist.mkdir(exist_ok=True)
    (dist/'vsix-size-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    markdown=['### VSIX size audit — v'+pkg['version'],'',
              '- Final VSIX: **'+f'{zippedBytes:,}'+' bytes**',
              '- Baseline v'+budget['baselineVersion']+': '+f'{budget["baselineBytes"]:,}'+' bytes',
              '- Change from baseline: '+f'{zippedBytes-budget["baselineBytes"]:+,}'+' bytes',
              '- Maximum budget: '+f'{limit:,}'+' bytes',
              '- Packaged source files: '+str(len(details)),
              '- Build-only minified files: '+str(len(audit['files'])),'',
              '| Folder | Compressed bytes | Source bytes | Files |',
              '|---|---:|---:|---:|']
    for name,group in sorted(groups.items(),key=lambda kv:kv[1]['compressedBytes'],reverse=True):
        markdown.append('| '+name+' | '+f'{group["compressedBytes"]:,}'+' | '+f'{group["sourceBytes"]:,}'+' | '+str(group['files'])+' |')
    markdown.extend(['','#### Largest compressed files','','| Path | Compressed bytes |','|---|---:|'])
    for item in report['files'][:12]:
        markdown.append('| '+item['path']+' | '+f'{item["compressedBytes"]:,}'+' |')
    if duplicates:
        markdown.extend(['','#### Identical retained assets',''])
        for duplicate in duplicates:
            markdown.append('- '+', '.join(duplicate['paths'])+' ('+str(duplicate['sourceBytes'])+' bytes each; retained for compatibility)')
    (dist/'vsix-size-report.md').write_text('\n'.join(markdown)+'\n',encoding='utf-8')
    print('Created: '+str(output)+' ('+f'{zippedBytes:,}'+' bytes) as '+identifier)
    print('Size audit: '+str(dist/'vsix-size-report.json'))
    if zippedBytes>limit:
        raise SystemExit('VSIX '+f'{zippedBytes:,}'+' exceeds the '+f'{limit:,}'+'-byte size budget. Review dist/vsix-size-report.md before publishing.')
