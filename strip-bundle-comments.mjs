import { readFileSync, writeFileSync } from 'node:fs';

const path = 'dist/content.js';
const src = readFileSync(path, 'utf8');
const lines = src.split('\n');
const kept = lines.filter(l => !/^\s*\/\/.*$/.test(l));
writeFileSync(path, kept.join('\n'), 'utf8');
console.log('stripped', lines.length - kept.length, 'bundler path-comment lines');
