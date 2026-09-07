import path from 'node:path';
import { HttpProblem } from '../http/problem';

function beginsWith(bytes: Buffer, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function containsAscii(bytes: Buffer, text: string): boolean {
  return bytes.includes(Buffer.from(text, 'ascii'));
}

const MAX_OOXML_ENTRIES = 2_000;
const MAX_OOXML_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_OOXML_COMPRESSION_RATIO = 100;

function rejectUnsafeArchive(): never {
  throw new HttpProblem(
    422,
    'EVIDENCE_ARCHIVE_UNSAFE',
    'Tệp nén minh chứng không an toàn',
    'Gói DOCX/XLSX vượt giới hạn giải nén hoặc có cấu trúc ZIP không an toàn.',
  );
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const earliestOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= earliestOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

/**
 * Reads only ZIP directory metadata: no decompression, file rendering, or execution. The limits
 * protect later scanner/preview adapters from resource exhaustion caused by a small OOXML upload.
 */
function inspectOoxmlArchive(bytes: Buffer): Set<string> {
  const endOffset = findEndOfCentralDirectory(bytes);
  if (endOffset < 0) rejectUnsafeArchive();

  const disk = bytes.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = bytes.readUInt16LE(endOffset + 6);
  const diskEntries = bytes.readUInt16LE(endOffset + 8);
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralDirectorySize = bytes.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(endOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (disk !== 0 || centralDirectoryDisk !== 0 || diskEntries !== entryCount
    || entryCount === 0 || entryCount > MAX_OOXML_ENTRIES
    || centralDirectoryOffset > endOffset || centralDirectoryEnd > endOffset) {
    rejectUnsafeArchive();
  }

  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  const paths = new Set<string>();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > centralDirectoryEnd || bytes.readUInt32LE(offset) !== 0x02014b50) rejectUnsafeArchive();
    const flags = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength;
    if ((flags & 0x0001) !== 0 || nextOffset > centralDirectoryEnd) rejectUnsafeArchive();

    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    if (localHeaderOffset + 30 > centralDirectoryOffset || bytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) rejectUnsafeArchive();
    const localFileNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
    const fileDataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    if (fileDataOffset + compressedSize > centralDirectoryOffset) rejectUnsafeArchive();

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_OOXML_UNCOMPRESSED_BYTES
      || (uncompressedSize > 0 && (compressedSize === 0 || uncompressedSize / compressedSize > MAX_OOXML_COMPRESSION_RATIO))) {
      rejectUnsafeArchive();
    }
    paths.add(bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8'));
    offset = nextOffset;
  }
  if (offset !== centralDirectoryEnd) rejectUnsafeArchive();
  return paths;
}

/**
 * Browser-provided MIME is only a claim. Validate file magic before storage and, for OOXML,
 * require the package path belonging to the claimed document family. This intentionally does not
 * execute or render the file; malware scanning remains an adapter/worker concern.
 */
export function validateEvidenceContent(bytes: Buffer, fileName: string, mimeType: string): void {
  const extension = path.extname(fileName).toLowerCase();
  const mime = mimeType.toLowerCase();
  const invalid = () => {
    throw new HttpProblem(
      415,
      'EVIDENCE_SIGNATURE_INVALID',
      'Nội dung tệp không hợp lệ',
      'Nội dung tệp không khớp với định dạng minh chứng đã khai báo.',
    );
  };
  if (extension === '.pdf' && mime === 'application/pdf') {
    if (!beginsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) invalid();
    return;
  }
  if ((extension === '.jpg' || extension === '.jpeg') && mime === 'image/jpeg') {
    if (!beginsWith(bytes, [0xff, 0xd8, 0xff])) invalid();
    return;
  }
  if (extension === '.png' && mime === 'image/png') {
    if (!beginsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) invalid();
    return;
  }
  if (extension === '.docx' && mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    if (!beginsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || !containsAscii(bytes, '[Content_Types].xml') || !containsAscii(bytes, 'word/document.xml')) invalid();
    const paths = inspectOoxmlArchive(bytes);
    if (!paths.has('[Content_Types].xml') || !paths.has('word/document.xml')) invalid();
    return;
  }
  if (extension === '.xlsx' && mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    if (!beginsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || !containsAscii(bytes, '[Content_Types].xml') || !containsAscii(bytes, 'xl/workbook.xml')) invalid();
    const paths = inspectOoxmlArchive(bytes);
    if (!paths.has('[Content_Types].xml') || !paths.has('xl/workbook.xml')) invalid();
    return;
  }
  invalid();
}
