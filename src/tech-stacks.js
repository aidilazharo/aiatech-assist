'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', 'resources');
// Stack identities and content are supplied by the activated GitHub catalog; never bundled.
const ID_RE = /^[a-z][a-z0-9-]{0,48}$/;
const ACCENT = /^#[0-9a-f]{6}$/i;
const catalogAssets = require('./github-sdlc-catalog');
function normalizeStack(input, expectedId) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error('Invalid tech stack template.');
    const id = String(input.id || '');
    if (!ID_RE.test(id) || id !== expectedId)
        throw new Error('Tech stack template ID does not match its filename.');
    const str = (key, max = 240) => {
        if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max)
            throw new Error(`Invalid tech stack ${key}.`);
        return input[key].trim();
    };
    const arr = (key) => {
        if (!Array.isArray(input[key]) || input[key].length > 20 || input[key].some(x => typeof x !== 'string' || !x.trim() || x.length > 120))
            throw new Error(`Invalid tech stack ${key}.`);
        return input[key].map(x => x.trim());
    };
    const accent = str('accent', 7);
    if (!ACCENT.test(accent))
        throw new Error('Tech stack accent must be a hex color.');
    const opt = key => input[key]===undefined?'':str(key,300);
    const previewUrl=opt('previewUrl');
    if(previewUrl){let u;try{u=new URL(previewUrl);}catch{throw Error('Invalid preview URL in remote catalog.');}if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')throw Error('Catalog preview URL must use localhost HTTP.');}
    for(const key of ['runCommand','testCommand','buildCommand']) if(input[key]!==undefined && !/^[a-zA-Z0-9_. /:-]+$/.test(input[key]))throw Error('Unsafe catalog command descriptor: '+key);
    return { schema: 1, id, name: str('name'), label: str('label'), accent, runtime: str('runtime'), language: str('language'), framework: str('framework'), buildTool: str('buildTool'), unit: arr('unit'), integration: arr('integration'), e2e: arr('e2e'), templateRepository: str('templateRepository'), notes: str('notes', 1200), previewUrl, apiBaseUrl:opt('apiBaseUrl'), accessManual:opt('accessManual'), orm:opt('orm'), database:opt('database'), stackType:opt('stackType'), runCommand:opt('runCommand'), testCommand:opt('testCommand'), buildCommand:opt('buildCommand') };
}
async function loadStack(id, workspace) {
    if (!workspace) throw Error('Open a workspace and pull the GitHub SDLC Catalog before choosing a stack.');
    const manifest = await catalogAssets.activeManifest(workspace);
    if (!manifest.techStacks.includes(id) || !ID_RE.test(id)) throw Error('Technology stack is not in the approved GitHub catalog: '+id);
    const raw = await catalogAssets.stackAsset(workspace,id);
    if (!raw) throw Error('Missing active catalog stack descriptor: '+id);
    return normalizeStack(JSON.parse(raw),id);
}
// Requirements are collected from the activated remote starter manifests,
// never from fixed package lists embedded in this extension. They are UI-only;
// native package managers remain authoritative when restoring dependencies.
function catalogDependencyPackages(files={}) {
    const result=[];const seen=new Set();
    const add=(name,version,manager,scope='runtime')=>{
        name=String(name||'').trim();version=String(version||'').trim();
        if(!name||name.length>130||!/^[@a-zA-Z0-9_.:/-]+$/.test(name)||result.length>=80)return;
        const key=manager+':'+name;
        if(seen.has(key))return;
        seen.add(key);result.push({name,version:version.slice(0,80),manager,scope});
    };
    for(const [file,content] of Object.entries(files)) {
        if((file==='package.json'||/^(?:apps\/web|services\/api)\/package\.json$/.test(file))&&content.length<128000){
            let pkg;try{pkg=JSON.parse(content.toString('utf8'));}catch{continue;}
            for(const [name,version] of Object.entries(pkg.dependencies||{}))add(name,version,'npm');
            for(const [name,version] of Object.entries(pkg.devDependencies||{}))add(name,version,'npm','development');
        } else if(/(?:^|\/)[^/]+\.csproj$/.test(file)&&content.length<128000){
            const raw=content.toString('utf8');const tags=raw.match(/<PackageReference\b[^>]*>/g)||[];
            for(const tag of tags){
                const name=tag.match(/\bInclude=["']([^"']+)["']/i)?.[1];
                const version=tag.match(/\bVersion=["']([^"']+)["']/i)?.[1];
                if(name)add(name,version||'', 'nuget');
            }
        } else if((file==='pom.xml'||/^[a-zA-Z0-9_-]+\/pom\.xml$/.test(file))&&content.length<128000){
            const xml=content.toString('utf8');
            const deps=xml.match(/<dependencies>([\s\S]*?)<\/dependencies>/g)||[];
            for(const group of deps){for(const match of group.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)){
                const body=match[1],g=body.match(/<groupId>([^<]+)<\/groupId>/)?.[1],a=body.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
                const version=body.match(/<version>([^<]+)<\/version>/)?.[1]||'';
                if(g&&a)add(g+':'+a,version,'maven',body.includes('<scope>test</scope>')?'test':'runtime');
            }}
        }
    }
    return result;
}
async function listStacks(workspace) {
    if (!workspace) return [];
    try {
        const manifest = await catalogAssets.activeManifest(workspace);
        return Promise.all(manifest.techStacks.map(async id=>{
            const stack=await loadStack(id,workspace);
            let files={};
            try{files=await catalogAssets.activeTree(workspace,'tech-stacks/'+id+'/scaffold');}
            catch(e){if(!/Missing catalog directory/i.test(e.message))throw e;}
            return {...stack,dependencyPackages:catalogDependencyPackages(files)};
        }));
    } catch(e) {
        if (/not activated|active GitHub catalog.json is missing|Pull the catalog/i.test(e.message)) return [];
        throw e;
    }
}
async function copyDefaults(from, to) {
    const names = await fs.readdir(from, { withFileTypes: true });
    try {
        const dst = await fs.lstat(to);
        if (!dst.isDirectory() || dst.isSymbolicLink())
            throw new Error('Workspace template folder must be a real directory.');
    }
    catch (e) {
        if (e.code !== 'ENOENT')
            throw e;
    }
    await fs.mkdir(to, { recursive: true });
    for (const ent of names) {
        if (ent.isSymbolicLink())
            throw new Error('Bundled templates must not contain symbolic links.');
        const src = path.join(from, ent.name), dst = path.join(to, ent.name);
        if (ent.isDirectory())
            await copyDefaults(src, dst);
        else if (ent.isFile()) {
            try {
                await fs.copyFile(src, dst, (require('node:fs').constants.COPYFILE_EXCL));
            }
            catch (e) {
                if (e.code !== 'EEXIST')
                    throw e;
            }
        }
    }
}
async function ensureWorkspaceLibrary(workspace) {
    const base = path.join(workspace, '.atgv');
    try {
        const st = await fs.lstat(base);
        if (!st.isDirectory() || st.isSymbolicLink())
            throw new Error('.atgv must be a real directory.');
    }
    catch (e) {
        if (e.code !== 'ENOENT')
            throw e;
    }
    await copyDefaults(path.join(ROOT, 'defaults'), base);
    const marker = path.join(base, 'atgv.workspace.json');
    try {
        await fs.writeFile(marker, JSON.stringify({ schema: 1, managedBy: 'aia-my.atgv-aiatech-assist' }, null, 2) + '\n', { flag: 'wx' });
    }
    catch (e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
    return base;
}
function stackMarkdown(stack) {
    const items = arr => arr.length ? arr.map(v => '- ' + v).join('\n') : '- TBD';
    return `# Technology Stack — ${stack.name}\n\n> Generated by ATGV. Review technology version support and enterprise approvals before implementation.\n\n| Category | Selection |\n|---|---|\n| Runtime | ${stack.runtime} |\n| Language | ${stack.language} |\n| Framework | ${stack.framework} |\n| Build tooling | ${stack.buildTool} |\n| Template repository | ${stack.templateRepository} |\n\n## Unit / component tests\n${items(stack.unit)}\n\n## Integration / contract tests\n${items(stack.integration)}\n\n## End-to-end tests\n${items(stack.e2e)}\n\n## Notes\n${stack.notes}\n`;
}
async function writeNew(file, content) {
    try {
        await fs.writeFile(file, content, { flag: 'wx', mode: 0o600 });
        return true;
    }
    catch (e) {
        if (e.code === 'EEXIST')
            return false;
        throw e;
    }
}
async function scaffoldProject(workspace, project) {
    const projectsRoot = path.join(workspace, 'projects');
    const base = path.join(projectsRoot, project.id);
    for (const folder of [projectsRoot, base]) {
        let stat;
        try {
            stat = await fs.lstat(folder);
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
        if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
            throw new Error('ATGV project folder must be a real directory.');
    }
    await fs.mkdir(base, { recursive: true });
    await copyDefaults(path.join(ROOT, 'defaults', 'sdlc'), path.join(base, 'sdlc'));
    for (const name of ['requirements', 'architecture', 'development', 'testing', 'deployment', 'meetings']) {
        const folder = path.join(base, 'documents', name);
        await fs.mkdir(folder, { recursive: true });
        await writeNew(path.join(folder, '.gitkeep'), '');
    }
    for (const name of ['branding', 'templates', 'skills']) {
        const folder = path.join(base, 'overrides', name);
        await fs.mkdir(folder, { recursive: true });
        await writeNew(path.join(folder, '.gitkeep'), '');
    }
    const knowledge = path.join(base, 'knowledge');
    await fs.mkdir(knowledge, { recursive: true });
    await writeNew(path.join(knowledge, 'sources.json'), JSON.stringify({ schema: 1, providers: ['Confluence', 'Jira', 'GitHub', 'Workspace'], note: 'GitHub is optional. Credentials are never stored in this file.' }, null, 2) + '\n');
    if (project.techStackId) {
        const stack = await loadStack(project.techStackId, workspace).catch(e => {if(/catalog|Pull|not activated/i.test(e.message)) return null;throw e;});
        if (stack) {
        await writeNew(path.join(base, 'tech-stack.json'), JSON.stringify(stack, null, 2) + '\n');
        const mdPath = path.join(base, 'documents', 'architecture', 'tech-stack.md');
        await writeNew(mdPath, stackMarkdown(stack));
        }
    }
    const { loadProjectRoles } = require('./sdlc-catalog');
    for (const role of await loadProjectRoles({ fileFor: () => path.join(base, 'atgv.project.json') }, project.id)) {
        for (const task of role.tasks) {
            if (!task.document)
                continue;
            const destination = path.join(base, 'documents', task.document);
            await fs.mkdir(path.dirname(destination), { recursive: true });
            let text = '';
            if (task.template) {
                const template = path.join(workspace, '.atgv', 'templates', task.template);
                try {
                    text = await fs.readFile(template, 'utf8');
                }
                catch (e) {
                    if (e.code !== 'ENOENT')
                        throw e;
                    text = await fs.readFile(path.join(ROOT, 'defaults', 'templates', task.template), 'utf8');
                }
            }
            else if (!task.template) {
                text = `# ${task.label}\n\n> Project placeholder — select a technology template or complete this document manually.\n\n## Notes\n\nTBD\n`;
            }
            await writeNew(destination, text);
        }
    }
    const planning = require('./planning');
    const ref = { fileFor: () => path.join(base, 'atgv.project.json') };
    await planning.createTimeline(ref, project.id);
    await planning.readDiagram(ref, project.id);
    return base;
}
async function removeManagedWorkspaceLibrary(workspace) {
    const base = path.join(workspace, '.atgv');
    let st;
    try {
        st = await fs.lstat(base);
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return false;
        throw e;
    }
    if (st.isSymbolicLink() || !st.isDirectory())
        throw new Error('Refusing reset: .atgv is not a normal directory.');
    let marker;
    try {
        marker = JSON.parse(await fs.readFile(path.join(base, 'atgv.workspace.json'), 'utf8'));
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return false;
        throw new Error('Refusing reset: invalid .atgv ownership marker.');
    }
    if (marker.managedBy !== 'aia-my.atgv-aiatech-assist')
        return false;
    await fs.rm(base, { recursive: true, force: true });
    return true;
}
module.exports = { normalizeStack, loadStack, listStacks, catalogDependencyPackages, ensureWorkspaceLibrary, scaffoldProject, removeManagedWorkspaceLibrary, stackMarkdown };
