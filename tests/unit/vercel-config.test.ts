import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vercel deployment configuration', () => {
  it('routes API traffic to one function and keeps a static SPA fallback', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
      buildCommand?: string;
      outputDirectory?: string;
      functions?: Record<string, { maxDuration?: number }>;
      rewrites?: Array<{ source: string; destination: string }>;
    };

    expect(config).toMatchObject({
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      functions: { 'api/index.mjs': { maxDuration: 60 } },
    });
    expect(config.rewrites?.[0]).toEqual({ source: '/api/:path*', destination: '/api/index' });
    expect(config.rewrites?.[1]).toEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('documents the same-origin API base expected by the frontend', () => {
    const envExample = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
    const apiSource = fs.readFileSync(path.join(process.cwd(), 'src', 'services', 'api.ts'), 'utf8');

    expect(envExample).toMatch(/^VITE_API_BASE_URL=\/api$/m);
    expect(apiSource).toContain('import.meta.env.VITE_API_BASE_URL');
  });
});
