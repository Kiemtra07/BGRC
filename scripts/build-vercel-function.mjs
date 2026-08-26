import { build } from 'esbuild';

await build({
  entryPoints: ['server/src/vercel-handler.ts'],
  outfile: 'api/index.mjs',
  bundle: true,
  format: 'esm',
  packages: 'external',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
});
