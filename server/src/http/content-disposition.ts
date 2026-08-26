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

export const buildInlineContentDisposition = (fileName: string): string => (
  `inline; filename="${asciiFallback(fileName)}"; filename*=UTF-8''${encodeRfc5987Value(fileName.normalize('NFC'))}`
);
