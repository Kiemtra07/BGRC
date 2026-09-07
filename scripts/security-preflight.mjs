import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const textExtensions = new Set(['.cjs', '.cts', '.js', '.json', '.mjs', '.mts', '.ts', '.tsx', '.yaml', '.yml']);
const secretPatterns = [
  { name: 'private key block', pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'GitHub token', pattern: /gh[pousr]_[A-Za-z0-9_]{30,}/ },
  { name: 'Slack token', pattern: /xox[baprs]-[A-Za-z0-9-]{16,}/ },
  { name: 'Stripe live secret', pattern: /sk_live_[A-Za-z0-9]{16,}/ },
];

const findings = [];
for (const relativePath of trackedFiles) {
  if (!textExtensions.has(path.extname(relativePath).toLowerCase())) continue;
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(source)) findings.push(`${relativePath}: ${name}`);
  }
}

if (findings.length) {
  console.error(`Secret preflight failed:\n${findings.map(item => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log(`Secret preflight passed for ${trackedFiles.length} tracked files.`);
