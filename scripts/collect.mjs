import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';

export function collect(roots, manifest) {
  const find = rel => roots.map(r => join(r, rel)).find(existsSync) || null;
  const seen = new Set();
  const missing = [];

  function want(rel) {
    const clean = rel.split('#')[0].split('?')[0];
    if (!clean || /^(https?:|data:|chrome:|moz-extension:)/.test(clean)) return;
    if (seen.has(clean)) return;
    if (!find(clean)) { missing.push(clean); return; }
    seen.add(clean);
    walk(clean);
  }

  const relativeTo = (from, spec) =>
    posix.normalize(posix.join(posix.dirname(from.split('\\').join('/')), spec));

  function walk(rel) {
    if (!/\.(js|mjs|html)$/.test(rel)) return;
    const src = readFileSync(find(rel), 'utf8');
    if (rel.endsWith('.html')) {
      for (const m of src.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const spec = m[1];
        if (/^(https?:|data:|chrome:|mailto:|#)/.test(spec)) continue;
        want(spec.startsWith('/') ? spec.slice(1) : relativeTo(rel, spec));
      }
    } else {
      for (const m of src.matchAll(/(?:^|[\s;{(])(?:import|export)\s[^'"]*from\s*['"]([^'"]+)['"]/g)) {
        if (m[1].startsWith('.')) want(relativeTo(rel, m[1]));
      }
      for (const m of src.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (m[1].startsWith('.')) want(relativeTo(rel, m[1]));
      }
    }
    for (const m of src.matchAll(/getURL\(\s*['"]([^'"]+)['"]\s*\)/g)) want(m[1]);
  }

  want('manifest.json');
  for (const icon of Object.values(manifest.icons || {})) want(icon);
  for (const icon of Object.values(manifest.action?.default_icon || {})) want(icon);
  if (manifest.action?.default_popup) want(manifest.action.default_popup);
  if (manifest.background?.service_worker) want(manifest.background.service_worker);
  for (const script of manifest.background?.scripts || []) want(script);
  if (manifest.options_ui?.page) want(manifest.options_ui.page);
  for (const cs of manifest.content_scripts || []) for (const js of cs.js || []) want(js);
  for (const war of manifest.web_accessible_resources || []) for (const r of war.resources || []) want(r);
  if (manifest.default_locale) {
    const dir = roots.map(r => join(r, '_locales')).find(existsSync);
    for (const locale of readdirSync(dir)) want(`_locales/${locale}/messages.json`);
  }

  return { files: [...seen].sort(), missing, find };
}
