import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import tailwindConfig from '../../tailwind.config.js';

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx|css)$/.test(entry.name) ? [full] : [];
  });
}

const files = sourceFiles(path.resolve(__dirname, '../../src'));

describe('độ rõ chữ của giao diện', () => {
  it('chữ nhỏ nhất theo thang chữ là 13px và chữ nội dung là 15px', () => {
    const fontSize = (tailwindConfig as { theme: { extend: { fontSize: Record<string, [string, unknown]> } } }).theme.extend.fontSize;
    expect(fontSize.xs[0]).toBe('0.8125rem');
    expect(fontSize.sm[0]).toBe('0.9375rem');
  });

  it('không còn cỡ chữ 12px viết tay đi vòng thang chữ', () => {
    const offenders = files.filter(file => fs.readFileSync(file, 'utf8').includes('text-[0.75rem]'));
    expect(offenders.map(file => path.relative(process.cwd(), file))).toEqual([]);
  });

  it('tiêu đề tiếng Việt không bị nén chữ quá chặt làm dính dấu', () => {
    const tight = files.flatMap(file => {
      const matches = fs.readFileSync(file, 'utf8').match(/tracking-\[-0\.0[3-9]\d*em\]/g) ?? [];
      return matches.map(match => `${path.relative(process.cwd(), file)}: ${match}`);
    });
    expect(tight).toEqual([]);
  });
});
