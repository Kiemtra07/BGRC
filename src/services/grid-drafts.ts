import type { KeyValueStorage } from './staged-import-retry';

const draftKey = (userId: string) => `audit-bgs:grid-drafts:${userId}`;

/** Khóa cũ dùng chung mọi tài khoản trong localStorage, không bao giờ bị xóa. */
const LEGACY_DRAFT_KEY = 'auditbgs.grid-drafts.v1';

/**
 * Giải trình đã gõ nhưng chưa gửi. Chỉ giữ trong tab và theo từng tài khoản: máy chi nhánh thường
 * dùng chung, nên nháp không được nằm lại cho người đăng nhập sau.
 */
export function loadGridDrafts(storage: KeyValueStorage, userId: string): Record<string, string> {
  try {
    const raw = storage.getItem(draftKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveGridDrafts(storage: KeyValueStorage, userId: string, drafts: Record<string, string>): void {
  try {
    if (Object.keys(drafts).length === 0) storage.removeItem(draftKey(userId));
    else storage.setItem(draftKey(userId), JSON.stringify(drafts));
  } catch {
    // Trình duyệt chặn hoặc đầy bộ nhớ: nháp chỉ còn trong trang đang mở.
  }
}

export function clearGridDrafts(storage: KeyValueStorage, userId: string): void {
  try {
    storage.removeItem(draftKey(userId));
  } catch {
    // Không có bộ nhớ thì cũng không có nháp để xóa.
  }
}

export function discardLegacyGridDrafts(storage: KeyValueStorage): void {
  try {
    storage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // Như trên.
  }
}
