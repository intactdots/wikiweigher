import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const abs = rel => join(ROOT, rel);
const manifest = JSON.parse(readFileSync(abs('manifest.json'), 'utf8'));
const OUT = abs(`.package/wikiweigher-${manifest.version}`);

const seen = new Set();
const missing = [];

function want(rel) {
  const clean = rel.split('#')[0].split('?')[0];
  if (!clean || /^(https?:|data:|chrome:)/.test(clean)) return;
  if (seen.has(clean)) return;
  if (!existsSync(abs(clean))) { missing.push(clean); return; }
  seen.add(clean);
  walk(clean);
}

function relativeTo(fromFile, spec) {
  return posix.normalize(posix.join(posix.dirname(fromFile.split('\\').join('/')), spec));
}

function resolveHtml(fromFile, spec) {
  if (/^(https?:|data:|chrome:|mailto:|#)/.test(spec)) return null;
  return spec.startsWith('/') ? spec.slice(1) : relativeTo(fromFile, spec);
}

function resolveModule(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  return relativeTo(fromFile, spec);
}

function walk(rel) {
  if (!/\.(js|mjs|html)$/.test(rel)) return;
  const src = readFileSync(abs(rel), 'utf8');
  if (rel.endsWith('.html')) {
    for (const m of src.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const target = resolveHtml(rel, m[1]);
      if (target) want(target);
    }
  } else {
    for (const m of src.matchAll(/(?:^|[\s;{(])(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]/g)) {
      const target = resolveModule(rel, m[1]);
      if (target) want(target);
    }
    for (const m of src.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const target = resolveModule(rel, m[1]);
      if (target) want(target);
    }
  }
  for (const m of src.matchAll(/getURL\(\s*['"]([^'"]+)['"]\s*\)/g)) want(m[1]);
}

want('manifest.json');
for (const icon of Object.values(manifest.icons || {})) want(icon);
for (const icon of Object.values(manifest.action?.default_icon || {})) want(icon);
if (manifest.action?.default_popup) want(manifest.action.default_popup);
if (manifest.background?.service_worker) want(manifest.background.service_worker);
if (manifest.options_ui?.page) want(manifest.options_ui.page);
for (const cs of manifest.content_scripts || []) for (const js of cs.js || []) want(js);
for (const war of manifest.web_accessible_resources || []) for (const r of war.resources || []) want(r);
if (manifest.default_locale) {
  for (const locale of readdirSync(abs('_locales'))) want(`_locales/${locale}/messages.json`);
}

if (missing.length) {
  console.error('referenced but missing from disk:');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}

rmSync(abs('.package'), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const rel of seen) {
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(abs(rel), dest);
}

const files = [...seen].sort();
const bytes = files.reduce((n, rel) => n + statSync(abs(rel)).size, 0);
console.log(`packaged ${files.length} files, ${(bytes / 1024).toFixed(1)} KB unzipped`);
for (const rel of files) console.log('  ' + rel);

const zip = abs(`.package/wikiweigher-${manifest.version}.zip`);
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', zip, '.'], { cwd: OUT, stdio: 'inherit' });
}
console.log(`zip: ${zip} (${(statSync(zip).size / 1024).toFixed(1)} KB)`);
