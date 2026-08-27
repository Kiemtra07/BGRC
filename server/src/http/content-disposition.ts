const encodeRfc5987Value = (value: string): string => encodeURIComponent(value)
  .replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const asciiFallback = (fileName: string): string => {
  const normalized = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\\r\n]/g, '_')
    .trim();

  return normalized || 'evidence';
};

const buildContentDisposition = (mode: 'inline' | 'attachment', fileName: string): string => (
  `${mode}; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeRfc5987Value(fileName.normalize('NFC'))}`
);

export const buildInlineContentDisposition = (fileName: string): string => buildContentDisposition('inline', fileName);

export const buildAttachmentContentDisposition = (fileName: string): string => buildContentDisposition('attachment', fileName);

/**
 * Chỉ những định dạng trình duyệt hiển thị được trong trình xem có sandbox mới được mở inline.
 * DOCX/XLSX không nằm ở đây: chúng luôn phải tải xuống rồi mở bằng ứng dụng ngoài.
 */
const INLINE_SAFE_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export const isInlineSafeMimeType = (mimeType: string): boolean => (
  INLINE_SAFE_MIME_TYPES.has(mimeType.toLowerCase())
);
