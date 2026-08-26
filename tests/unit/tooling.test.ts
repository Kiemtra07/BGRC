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
