import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const vitestEntrypoint = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const suiteArgs = process.argv.slice(2);
const maximumAttempts = 2;

function runVitest() {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [vitestEntrypoint, 'run', ...suiteArgs], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', chunk => {
        const text = chunk.toString();
        output += text;
        process.stdout.write(text);
      });
    }
    child.on('error', error => resolve({ code: 1, output: `${output}\n${error.message}` }));
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });
}

for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
  const result = await runVitest();
  if (result.code === 0) process.exit(0);

  const workerCrashed = /Worker exited unexpectedly|vitest-pool.*Worker forks emitted error/is.test(result.output);
  if (!workerCrashed || attempt === maximumAttempts) process.exit(result.code);
  process.stderr.write(`Vitest worker stopped unexpectedly; retrying once (${attempt}/${maximumAttempts}).\n`);
}
