import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = join(root, 'deploy-stage');
const files = [];
const required = ['app.yaml', 'package.json', 'package-lock.json', 'server.mjs', 'config/taxonomy.json', 'config/taxonomy-source.yaml'];
const publicExtensions = new Set(['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2']);

async function add(relative) {
  const path = join(root, relative);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Stage requires regular file: ${relative}`);
  files.push({ relative, bytes: await readFile(path) });
}

async function walk(relative, allowed) {
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.name.startsWith('.') || name === 'public/data' || name === 'public/assets/axe.min.js') continue;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in deployment tree: ${name}`);
    if (entry.isDirectory()) await walk(name, allowed);
    else if (entry.isFile() && allowed(name)) await add(name);
  }
}

// Match credential values, not legitimate references to environment-variable names.
// Reports contain filenames only; a rejected credential is never printed.
const secretPatterns = [
  /\bdapi[0-9a-f]{24,}\b/i,
  /\b(?:sk-proj-|sk-ant-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/,
  /(?:access[_-]?token|client[_-]?secret|api[_-]?key|authorization)\s*["']?\s*[:=]\s*["'](?:Bearer\s+)?[A-Za-z0-9_+\/.=-]{24,}["']/i,
];

for (const relative of required) await add(relative);
const snapshot=JSON.parse(await readFile(join(root,'data/snapshot-manifest.json'),'utf8'));
if(snapshot.format!==1||!snapshot.parts?.length)throw new Error('Missing private snapshot');
await add('data/snapshot-manifest.json');
for(const [i,part]of snapshot.parts.entries()){
 if(part.name!=='snapshot-'+String(i).padStart(3,'0')+'.bin')throw new Error('Unexpected snapshot part');
 const bytes=await readFile(join(root,'data',part.name));
 if(bytes.length!==part.bytes||createHash('sha256').update(bytes).digest('hex')!==part.sha256)throw new Error('Snapshot part mismatch');
 await add('data/'+part.name);
}

await walk('server', name => ['.mjs', '.js', '.json'].includes(extname(name)) && !/\.(?:test|spec)\./.test(name));
await walk('public', name => publicExtensions.has(extname(name)) && !/\.(?:test|spec)\./.test(name));
for (const { relative, bytes } of files) {
  if (relative.startsWith('data/snapshot-')&&relative.endsWith('.bin')) continue;
  if (['.woff', '.woff2', '.png', '.jpg', '.jpeg', '.webp', '.ico'].includes(extname(relative))) continue;
  if (secretPatterns.some(pattern => pattern.test(bytes.toString('utf8')))) throw new Error(`Secret scan rejected ${relative}`);
}

const taxonomy = JSON.parse(files.find(file => file.relative === 'config/taxonomy.json').bytes);
const source = files.find(file => file.relative === 'config/taxonomy-source.yaml').bytes;
if (taxonomy.version !== createHash('sha256').update(source).digest('hex')) throw new Error('Taxonomy source hash mismatch');
try {
  const existing = await lstat(target);
  if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('Refusing non-directory stage target');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm(target, { recursive: true, force: true });
for (const { relative, bytes } of files) {
  const path = join(target, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
console.log(JSON.stringify({ directory: target, taxonomyVersion: taxonomy.version, secretScan: 'passed',
  files: files.map(file => file.relative).sort() }, null, 2));
