import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('priority monitoring UI', () => {
  it('renders a separate priority group and an accessible star action', () => {
    const sidebar = fs.readFileSync('src/components/portal/WorkspaceSidebar.tsx', 'utf8');
    const detail = fs.readFileSync('src/components/portal/FindingDetailPage.tsx', 'utf8');

    expect(sidebar).toContain('Ưu tiên giám sát');
    expect(sidebar).toContain('isPriority');
    expect(detail).toContain('Ưu tiên giám sát');
    expect(detail).toContain('aria-pressed');
    expect(detail).toContain('setWatchPriority');
  });
});
