import { readFileSync } from 'node:fs';

const read = p => JSON.parse(readFileSync(new URL(p, new URL('../', import.meta.url)), 'utf8'));

const manifest = read('manifest.json').version;
const pkg = read('package.json').version;
const readme = readFileSync(new URL('README.md', new URL('../', import.meta.url)), 'utf8');
const badge = (readme.match(/img\.shields\.io\/badge\/version-([0-9.]+)-/) || [])[1];
const tag = (process.env.TAG || process.argv[2] || '').replace(/^v/, '');

const problems = [];
if (manifest !== pkg) problems.push(`manifest.json is ${manifest} but package.json is ${pkg}`);
if (tag && tag !== manifest) problems.push(`tag is ${tag} but manifest.json is ${manifest}`);
if (!badge) problems.push('README.md has no version badge to check');
else if (badge !== manifest) problems.push(`README.md badge says ${badge} but manifest.json is ${manifest}`);

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`version ${manifest}${tag ? ' matches tag' : ''}`);
