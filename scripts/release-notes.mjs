import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const version = (process.env.TAG || process.argv[2] || JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version).replace(/^v/, '');
const lines = readFileSync(new URL('CHANGELOG.md', root), 'utf8').split(/\r?\n/);

const start = lines.findIndex(l => l.trim() === `## ${version}`);
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^## /.test(lines[i])) { end = i; break; }
}

const body = lines.slice(start + 1, end).join('\n').trim();
if (!body) {
  console.error(`the ${version} section of CHANGELOG.md is empty`);
  process.exit(1);
}
console.log(body);
