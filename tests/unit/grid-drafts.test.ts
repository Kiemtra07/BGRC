import { describe, expect, it } from 'vitest';
import {
  clearGridDrafts,
  discardLegacyGridDrafts,
  loadGridDrafts,
  saveGridDrafts,
} from '../../src/services/grid-drafts';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
};

describe('nháp giải trình ở lưới hồ sơ', () => {
  it('lưu riêng theo tài khoản nên người đăng nhập sau không thấy nháp của người trước', () => {
    const storage = memoryStorage();
    saveGridDrafts(storage, 'user-a', { 'find-1': 'Đã bổ sung chứng từ giải ngân.' });

    expect(loadGridDrafts(storage, 'user-a')).toEqual({ 'find-1': 'Đã bổ sung chứng từ giải ngân.' });
    expect(loadGridDrafts(storage, 'user-b')).toEqual({});
  });

  it('xóa đúng nháp của tài khoản đăng xuất', () => {
    const storage = memoryStorage();
    saveGridDrafts(storage, 'user-a', { 'find-1': 'Nháp của A.' });
    saveGridDrafts(storage, 'user-b', { 'find-1': 'Nháp của B.' });

    clearGridDrafts(storage, 'user-a');

    expect(loadGridDrafts(storage, 'user-a')).toEqual({});
    expect(loadGridDrafts(storage, 'user-b')).toEqual({ 'find-1': 'Nháp của B.' });
  });

  it('không giữ khóa rỗng và chịu được dữ liệu hỏng', () => {
    const storage = memoryStorage();
    saveGridDrafts(storage, 'user-a', { 'find-1': 'Nháp.' });
    saveGridDrafts(storage, 'user-a', {});
    expect(storage.length).toBe(0);

    storage.setItem('audit-bgs:grid-drafts:user-a', '{không phải json');
    expect(loadGridDrafts(storage, 'user-a')).toEqual({});
  });

  it('xóa khóa cũ dùng chung mọi tài khoản trong localStorage', () => {
    const local = memoryStorage();
    local.setItem('auditbgs.grid-drafts.v1', JSON.stringify({ 'find-1': 'Nháp cũ của người khác.' }));

    discardLegacyGridDrafts(local);

    expect(local.getItem('auditbgs.grid-drafts.v1')).toBeNull();
  });
});
