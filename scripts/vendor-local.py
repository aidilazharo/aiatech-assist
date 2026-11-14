import sys, tarfile, pathlib, shutil, json, hashlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
VENDOR = ROOT/'media'/'vendor'
VENDOR.mkdir(parents=True, exist_ok=True)


def copy_member(archive, info, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with archive.extractfile(info) as source, destination.open('wb') as target:
        shutil.copyfileobj(source, target)


def from_tgz(src, folder, required, version, license_candidates):
    dest=VENDOR/folder
    if dest.exists(): shutil.rmtree(dest)
    dest.mkdir()
    with tarfile.open(src, 'r:gz') as tar:
        members={m.name: m for m in tar.getmembers() if m.isfile()}
        for original, short in required.items():
            name='package/'+original
            if name not in members: raise ValueError('Missing runtime asset: '+name)
            copy_member(tar, members[name], dest/short)
        for name in license_candidates:
            if name in members:
                copy_member(tar,members[name],dest/'LICENSE'); break
        else: raise ValueError('Missing license in '+str(src))
    (dest/'VERSION').write_text(version+'\n')

def manifest():
    rows=[]
    for path in sorted(VENDOR.rglob('*')):
        if path.is_file() and path.name not in ['asset-manifest.json','README.md']:
            data=path.read_bytes()
            rows.append({'path':path.relative_to(VENDOR).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    (VENDOR/'asset-manifest.json').write_text(json.dumps({'source':'user-supplied pinned release archives','assets':rows},indent=2)+'\n')
    return rows


def main():
    if len(sys.argv)!=3:
        raise SystemExit('Expected Quill TGZ and Frappe Gantt TGZ')
    q,g=map(pathlib.Path,sys.argv[1:]);
    for file in [q,g]:
        if not file.is_file(): raise SystemExit('Archive not found: '+str(file))
    from_tgz(q,'quill',{'dist/quill.js':'quill.js','dist/quill.snow.css':'quill.snow.css'},'2.0.3',['package/LICENSE','package/LICENSE.md','package/LICENSE.txt'])
    from_tgz(g,'frappe-gantt',{'dist/frappe-gantt.umd.js':'frappe-gantt.umd.js','dist/frappe-gantt.css':'frappe-gantt.css'},'1.2.2',['package/license.txt','package/LICENSE','package/LICENSE.md'])
    rows=manifest()
    for name in ['quill','frappe-gantt']:
        files=[a for a in rows if a['path'].startswith(name+'/')]
        print(f'{name}: {len(files)} files, {sum(a["bytes"] for a in files):,} bytes (uncompressed)')
    print('ATGV SVG .drawio canvas included with extension; no draw.io distribution required.')

if __name__=='__main__':main()
