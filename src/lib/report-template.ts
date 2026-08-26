import JSZip from 'jszip';
import { DynamicFieldDefinition, DynamicSchemaConfig, FieldDataType, ReportFormBlock } from '../../shared/contracts';

export interface ExcelColumnRule {
  emphasized: boolean;
  dropdownOptions?: string[];
}

const excelColumnNumber = (reference: string): number => {
  const letters = reference.toUpperCase().match(/^[A-Z]+/)?.[0] ?? '';
  return [...letters].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
};

const decodeXml = (value: string): string => value
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

export const extractExcelColumnRules = (
  sheetXml: string,
  stylesXml: string,
  headerRowIndex: number,
): Record<number, ExcelColumnRule> => {
  const fontSection = stylesXml.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/i)?.[1] ?? '';
  const normalizedFontSection = fontSection.replace(/<font\b([^>]*)\/>/gi, '<font$1></font>');
  const boldFonts = [...normalizedFontSection.matchAll(/<font\b[^>]*>([\s\S]*?)<\/font>/gi)]
    .map(match => /<b(?:\s[^>]*)?\s*\/?\s*>/i.test(match[1]));
  const cellXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i)?.[1] ?? '';
  const styleIsBold = [...cellXfs.matchAll(/<xf\b([^>]*)\/?\s*>/gi)].map(match => {
    const fontId = Number(match[1].match(/\bfontId="(\d+)"/i)?.[1] ?? 0);
    return boldFonts[fontId] === true;
  });
  const rules: Record<number, ExcelColumnRule> = {};
  const headerRow = sheetXml.match(new RegExp(`<row\\b[^>]*\\br="${headerRowIndex}"[^>]*>([\\s\\S]*?)<\\/row>`, 'i'))?.[1] ?? '';

  for (const match of headerRow.matchAll(/<c\b([^>]*)>/gi)) {
    const reference = match[1].match(/\br="([A-Z]+\d+)"/i)?.[1];
    if (!reference) continue;
    const column = excelColumnNumber(reference);
    const styleId = Number(match[1].match(/\bs="(\d+)"/i)?.[1] ?? 0);
    rules[column] = { emphasized: styleIsBold[styleId] === true, dropdownOptions: undefined };
  }

  for (const match of sheetXml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/gi)) {
    const range = match[1].match(/\bsqref="([^"]+)"/i)?.[1]?.split(/\s+/)[0];
    const formula = match[2].match(/<formula1>([\s\S]*?)<\/formula1>/i)?.[1];
    if (!range || !formula) continue;
    const column = excelColumnNumber(range.split(':')[0]);
    const decoded = decodeXml(formula).trim().replace(/^"|"$/g, '');
    const dropdownOptions = decoded.split(',').map(option => option.trim()).filter(Boolean);
    if (!column || !dropdownOptions.length) continue;
    rules[column] = { emphasized: rules[column]?.emphasized ?? false, dropdownOptions };
  }

  return rules;
};

export const analyzeExcelTemplateFile = async (
  arrayBuffer: ArrayBuffer,
  headerRowIndex: number,
): Promise<Record<number, ExcelColumnRule>> => {
  const workbook = await JSZip.loadAsync(arrayBuffer);
  const worksheetName = Object.keys(workbook.files)
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))[0];
  if (!worksheetName) return {};
  const [sheetXml, stylesXml] = await Promise.all([
    workbook.file(worksheetName)?.async('string') ?? Promise.resolve(''),
    workbook.file('xl/styles.xml')?.async('string') ?? Promise.resolve(''),
  ]);
  return extractExcelColumnRules(sheetXml, stylesXml, headerRowIndex);
};

export const applyExcelColumnRules = (
  schema: DynamicSchemaConfig,
  rules: Record<number, ExcelColumnRule>,
): DynamicSchemaConfig => ({
  ...schema,
  fields: schema.fields.map(field => {
    const rule = field.excelColumnIndex ? rules[field.excelColumnIndex] : undefined;
    if (!rule) return field;
    return {
      ...field,
      dataType: rule.dropdownOptions?.length ? 'select' : field.dataType,
      dropdownOptions: rule.dropdownOptions?.map(option => ({ label: option, value: option })) ?? field.dropdownOptions,
      isEmphasized: rule.emphasized,
    };
  }),
});

const textValue = (value: unknown): string => String(value ?? '').trim();

const fieldKeyFromLabel = (label: string, fallback: number): string => {
  const normalized = label.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safe = /^[a-z]/.test(normalized) ? normalized : `cot_${normalized || fallback}`;
  return safe.slice(0, 70);
};

const inferDataType = (values: unknown[]): FieldDataType => {
  const samples = values.filter(value => value !== null && value !== undefined && value !== '');
  if (samples.some(value => value instanceof Date)) return 'date';
  if (samples.length > 0 && samples.every(value => typeof value === 'number')) return 'number';
  if (samples.some(value => textValue(value).length > 120)) return 'textarea';
  return 'string';
};

export const buildReportTemplateFromExcelRows = (rows: unknown[][], fileName: string): DynamicSchemaConfig => {
  const candidates = rows.slice(0, 20).map((row, index) => ({
    index,
    score: row.filter(value => textValue(value).length > 0).length,
  }));
  const headerIndex = candidates.reduce((best, candidate) => candidate.score > best.score ? candidate : best, { index: 0, score: 0 }).index;
  const headerRow = rows[headerIndex] ?? [];
  const usedKeys = new Set<string>();
  const fields: DynamicFieldDefinition[] = [];

  headerRow.forEach((value, columnIndex) => {
    const label = textValue(value);
    if (!label) return;
    const baseKey = fieldKeyFromLabel(label, columnIndex + 1);
    let fieldKey = baseKey;
    let suffix = 2;
    while (usedKeys.has(fieldKey)) fieldKey = `${baseKey}_${suffix++}`;
    usedKeys.add(fieldKey);
    fields.push({
      fieldKey,
      label,
      dataType: inferDataType(rows.slice(headerIndex + 1, headerIndex + 11).map(row => row[columnIndex])),
      isRequired: false,
      excelHeaderAliases: [label],
      excelColumnIndex: columnIndex + 1,
      displayOrder: fields.length + 1,
      showInTableGrid: fields.length < 8,
    });
  });

  const blocks: ReportFormBlock[] = [
    { id: 'section_excel_1', type: 'SECTION', title: 'Thông tin báo cáo', width: 'FULL' },
    ...fields.map((field, index): ReportFormBlock => ({
      id: `field_excel_${index + 1}`,
      type: 'FIELD',
      fieldKey: field.fieldKey,
      width: field.dataType === 'textarea' ? 'FULL' : 'HALF',
    })),
  ];

  return {
    tableName: fieldKeyFromLabel(fileName.replace(/\.[^.]+$/, ''), 1),
    fields,
    excelHeaderRowIndex: headerIndex + 1,
    dataStartRowIndex: headerIndex + 2,
    formTemplate: {
      name: `Mẫu ${fileName.replace(/\.[^.]+$/, '')}`,
      source: 'EXCEL',
      sourceFileName: fileName,
      presentationMode: 'CASE_REVIEW',
      allowEvidenceAttachments: true,
      blocks,
    },
  };
};
