import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(process.cwd());

describe('local delivery tooling', () => {
  it('provides the database runner files referenced by package scripts', () => {
    expect(fs.existsSync(path.join(root, 'db', 'migrate.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'db', 'seed.ts'))).toBe(true);
  });

  it('keeps the CI script responsible for unit, integration, and contract gates', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const ci = packageJson.scripts.ci as string;

    expect(ci).toContain('test:unit');
    expect(ci).toContain('test:integration');
    expect(ci).toContain('test:contract');
  });

  it('has an explicit Vitest project boundary', () => {
    expect(fs.existsSync(path.join(root, 'vitest.config.ts'))).toBe(true);
  });
});

describe('TypeScript settings the deploy target also enforces', () => {
  /** JSONC: tsconfig files carry comments, which JSON.parse rejects. */
  const readTsconfig = (name: string) => JSON.parse(
    fs.readFileSync(path.join(root, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, ''),
  );

  it('keeps the root lib new enough for the syntax the server actually uses', () => {
    // Vercel type-checks api/** with the ROOT tsconfig, not tsconfig.server.json. When the root
    // sat at ES2020 the deploy failed with TS2550 on String.prototype.replaceAll (ES2021) while
    // `npm run typecheck` stayed green locally, because tsconfig.server.json overrides lib.
    const root7 = readTsconfig('tsconfig.json');
    const server = readTsconfig('tsconfig.server.json');
    const minimum = 2021;
    const yearOf = (lib: string) => Number(lib.replace(/^ES/i, '')) || 0;

    for (const [label, config] of [['tsconfig.json', root7], ['tsconfig.server.json', server]] as const) {
      const libs: string[] = config.compilerOptions.lib ?? [];
      const highest = Math.max(0, ...libs.map(yearOf));
      expect(`${label}: ES${highest}`).toBe(`${label}: ES${Math.max(highest, minimum)}`);
      expect(highest).toBeGreaterThanOrEqual(minimum);
    }
  });
});
