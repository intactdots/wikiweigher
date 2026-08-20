import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './collect.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'firefox');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'dist'), { recursive: true });

const bundle = (entry, file) => buildSync({
  entryPoints: [join(root, entry)],
  bundle: true,
  format: 'iife',
  outfile: join(out, 'dist', file),
  legalComments: 'none'
});

bundle('src/content/main.js', 'content.js');
bundle('src/background.js', 'background.js');

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
delete manifest.background;
manifest.background = { scripts: ['dist/background.js'] };
manifest.browser_specific_settings = {
  gecko: {
    id: 'wikiweigher@intactdots.com',
    strict_min_version: '128.0',
    data_collection_permissions: { required: ['none'] }
  }
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const { files, missing, find } = collect([out, root], manifest);
if (missing.length) {
  console.error('referenced but missing:');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}

for (const rel of files) {
  const dest = join(out, rel);
  const src = find(rel);
  if (src === dest) continue;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

const stray = [];
const sweep = dir => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sweep(path);
    else {
      const rel = relative(out, path).split(sep).join('/');
      if (!files.includes(rel)) stray.push(rel);
    }
  }
};
sweep(out);
for (const rel of stray) rmSync(join(out, rel));

const bytes = files.reduce((n, rel) => n + statSync(join(out, rel)).size, 0);
console.log(`firefox package: ${files.length} files, ${(bytes / 1024).toFixed(1)} KB unzipped`);
for (const rel of files) console.log('  ' + rel);

const zipper = () => {
  for (const bin of ['python', 'python3']) {
    try { execFileSync(bin, ['-c', 'import zipfile'], { stdio: 'ignore' }); return bin; } catch {}
  }
  throw new Error('zipping needs python; the build itself does not');
};

if (process.argv.includes('--zip') || process.argv.includes('--source')) {
const zip = join(out, '..', '.package', `wikiweigher-firefox-${manifest.version}.zip`);
mkdirSync(dirname(zip), { recursive: true });
const py = [
  'import zipfile,sys,os',
  'root=sys.argv[2]',
  'with zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED) as z:',
  '    [z.write(os.path.join(root,n),n) for n in sys.argv[3:]]'
].join(String.fromCharCode(10));
execFileSync(zipper(), ['-c', py, zip, out, ...files], { cwd: root, stdio: 'inherit' });
console.log(`zip: ${zip} (${(statSync(zip).size / 1024).toFixed(1)} KB)`);
}

if (process.argv.includes('--source')) {
  const walk = (dir, acc = []) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, acc);
      else acc.push(relative(root, path).split(sep).join('/'));
    }
    return acc;
  };
  const entries = [
    ...['src', '_locales', 'icons'].flatMap(d => walk(join(root, d))),
    'scripts/build-firefox.mjs', 'scripts/collect.mjs',
    'manifest.json', 'package.json', 'package-lock.json', 'LICENSE', 'store/REVIEWERS.md'
  ];
  const srcZip = join(root, '.package', `wikiweigher-source-${manifest.version}.zip`);
  const pySrc = [
    'import zipfile,sys',
    'with zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED) as z:',
    '    [z.write(n,n) for n in sys.argv[2:]]'
  ].join(String.fromCharCode(10));
  execFileSync(zipper(), ['-c', pySrc, srcZip, ...entries], { cwd: root, stdio: 'inherit' });
  console.log(`source zip: ${srcZip} | ${entries.length} files`);
}
