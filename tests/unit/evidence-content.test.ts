import { describe, expect, it } from 'vitest';
import { validateEvidenceContent } from '../../server/src/security/evidence-content';

function ooxmlArchive(entries: Array<{ name: string; compressedSize?: number; uncompressedSize?: number }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'ascii');
    const compressedSize = entry.compressedSize ?? 0;
    const uncompressedSize = entry.uncompressedSize ?? compressedSize;
    const local = Buffer.alloc(30 + name.length + compressedSize);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(compressedSize, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    localOffset += local.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, central, end]);
}

describe('evidence content validation', () => {
  it('rejects a payload whose bytes do not match its claimed PDF type', () => {
    try {
      validateEvidenceContent(
        Buffer.from('MZ executable payload'),
        'minh-chung.pdf',
        'application/pdf',
      );
      throw new Error('Expected signature validation to reject the payload');
    } catch (error) {
      expect(error).toMatchObject({ code: 'EVIDENCE_SIGNATURE_INVALID' });
    }
  });

  it('accepts a PDF only when it carries the PDF signature', () => {
    expect(() => validateEvidenceContent(
      Buffer.from('%PDF-1.7\nminimal', 'ascii'),
      'minh-chung.pdf',
      'application/pdf',
    )).not.toThrow();
  });

  it('accepts a structurally bounded DOCX package with the required entries', () => {
    expect(() => validateEvidenceContent(
      ooxmlArchive([
        { name: '[Content_Types].xml' },
        { name: 'word/document.xml' },
      ]),
      'minh-chung.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )).not.toThrow();
  });

  it('rejects an OOXML archive whose declared expansion is unsafe', () => {
    const zipBomb = ooxmlArchive([
      { name: '[Content_Types].xml' },
      { name: 'word/document.xml', compressedSize: 1, uncompressedSize: 101 * 1024 * 1024 },
    ]);

    try {
      validateEvidenceContent(
        zipBomb,
        'minh-chung.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      throw new Error('Expected archive safety validation to reject the payload');
    } catch (error) {
      expect(error).toMatchObject({ code: 'EVIDENCE_ARCHIVE_UNSAFE' });
    }
  });
});
