import React from 'react';
import { Inbox } from 'lucide-react';
import {
  DynamicFieldDefinition, DynamicSchemaConfig, ReportFormBlock, ReportFormBlockWidth, ReportFormTemplate,
} from '../../../shared/contracts';

export const REPORT_FORM_WIDTH_CLASS: Record<ReportFormBlockWidth, string> = {
  FULL: 'sm:col-span-6',
  HALF: 'sm:col-span-3',
  THIRD: 'sm:col-span-2',
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * CoPlus numbers the two heading levels of an inspection record as "A., B., C." and "I., II., III.".
 * Numbering is derived from block order so an admin reordering the template never has to renumber.
 */
export const reportFormHeadingNumbers = (blocks: ReportFormBlock[]): Record<string, string> => {
  const numbers: Record<string, string> = {};
  let section = 0;
  let subsection = 0;
  for (const block of blocks) {
    if (block.type === 'SECTION') {
      numbers[block.id] = `${String.fromCharCode(65 + (section % 26))}.`;
      section += 1;
      subsection = 0;
    } else if (block.type === 'SUBSECTION') {
      numbers[block.id] = `${ROMAN[subsection % ROMAN.length]}.`;
      subsection += 1;
    }
  }
  return numbers;
};

/** Label + required marker in CoPlus order: a red asterisk sits before the label, not after it. */
export const ReportFieldLabel: React.FC<{ label: string; required?: boolean; emphasized?: boolean }> = ({ label, required, emphasized }) => (
  <span className={`block text-[11px] leading-4 text-slate-700 ${emphasized ? 'font-black' : 'font-semibold'}`}>
    {required && <span className="text-red-600">* </span>}{label}
  </span>
);

export const ReportFormEmptyState: React.FC<{ message?: string }> = ({ message = 'Trống' }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
    <Inbox className="h-8 w-8" aria-hidden="true" />
    <span className="text-[11px] font-semibold">{message}</span>
  </div>
);

export const defaultReportFormBlocks = (fields: DynamicFieldDefinition[]): ReportFormBlock[] => [
  { id: 'section_default', type: 'SECTION', title: 'Thông tin báo cáo', width: 'FULL' },
  ...fields.map((field, index): ReportFormBlock => ({
    id: `field_default_${index + 1}`,
    type: 'FIELD',
    fieldKey: field.fieldKey,
    width: field.dataType === 'textarea' ? 'FULL' : 'HALF',
  })),
];

export const defaultReportFormTemplate = (name: string, fields: DynamicFieldDefinition[]): ReportFormTemplate => ({
  name,
  source: 'MANUAL',
  presentationMode: 'CASE_REVIEW',
  allowEvidenceAttachments: true,
  blocks: defaultReportFormBlocks(fields),
});

export const resolveReportFormTemplate = (
  schema: DynamicSchemaConfig,
  fallbackName = 'Mẫu nhập báo cáo',
): ReportFormTemplate => schema.formTemplate ?? defaultReportFormTemplate(fallbackName, schema.fields);

/** Keys a template actually places on the page, in render order and without repeats. */
export const placedReportFormFieldKeys = (blocks: ReportFormBlock[]): string[] => {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const keys = block.type === 'FIELD'
      ? (block.fieldKey ? [block.fieldKey] : [])
      : block.type === 'FIELD_GROUP' ? (block.fieldKeys ?? []) : [];
    for (const key of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
};

/**
 * Fields the admin declared but never placed on the template. They are still rendered at the end of
 * the form: dropping them would hide a required field and leave the form permanently unsubmittable.
 */
export const unplacedReportFormFields = (
  fields: DynamicFieldDefinition[],
  blocks: ReportFormBlock[],
): DynamicFieldDefinition[] => {
  const placed = new Set(placedReportFormFieldKeys(blocks));
  return fields.filter(field => !placed.has(field.fieldKey));
};

/** Blocks that point at a field key the schema no longer defines. */
export const danglingReportFormBlocks = (
  fields: DynamicFieldDefinition[],
  blocks: ReportFormBlock[],
): ReportFormBlock[] => {
  const known = new Set(fields.map(field => field.fieldKey));
  return blocks.filter(block => {
    if (block.type === 'FIELD') return !block.fieldKey || !known.has(block.fieldKey);
    if (block.type === 'FIELD_GROUP') return !block.fieldKeys?.length || block.fieldKeys.some(key => !known.has(key));
    return false;
  });
};

interface Props {
  schema: DynamicSchemaConfig;
  template: ReportFormTemplate;
  /** Renders one labelled field at the given width; must return a grid child. */
  renderField: (field: DynamicFieldDefinition, width: ReportFormBlockWidth) => React.ReactNode;
  /** Renders the bare control for a field, used by the Excel-grid presentation. */
  renderGridCell: (field: DynamicFieldDefinition) => React.ReactNode;
  renderCampaignContext?: (block: ReportFormBlock) => React.ReactNode;
}

/**
 * Single source of truth for how a report form template is laid out. The admin preview and the
 * runtime capture form both render through here so what an admin previews is what a user gets.
 */
export const ReportFormBlockLayout: React.FC<Props> = ({
  schema, template, renderField, renderGridCell, renderCampaignContext,
}) => {
  const fieldByKey = new Map(schema.fields.map(field => [field.fieldKey, field]));
  const orphans = unplacedReportFormFields(schema.fields, template.blocks);

  if (template.presentationMode === 'EXCEL_GRID') {
    const ordered = [
      ...placedReportFormFieldKeys(template.blocks)
        .map(key => fieldByKey.get(key))
        .filter((field): field is DynamicFieldDefinition => Boolean(field)),
      ...orphans,
    ];
    const columns = ordered.length ? ordered : schema.fields;
    if (!columns.length) return null;
    return <div className="overflow-x-auto rounded-lg border border-rule bg-white">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead><tr>{columns.map(field => (
          <th key={field.fieldKey} className={`min-w-[160px] border-b border-r border-rule bg-slate-100 px-3 py-2 text-slate-700 ${field.isEmphasized ? 'font-black' : 'font-bold'}`}>
            {field.label}{field.isRequired && <span className="text-red-600"> *</span>}
          </th>
        ))}</tr></thead>
        <tbody><tr>{columns.map(field => (
          <td key={field.fieldKey} className="border-r border-rule p-2 align-top">
            {renderGridCell(field)}
            {field.helpText && <span className="mt-1 block text-[10px] text-slate-500">{field.helpText}</span>}
          </td>
        ))}</tr></tbody>
      </table>
    </div>;
  }

  const rendered = new Set<string>();
  const headingNumbers = reportFormHeadingNumbers(template.blocks);
  const renderOnce = (key: string | undefined, width: ReportFormBlockWidth): React.ReactNode => {
    if (!key || rendered.has(key)) return null;
    const field = fieldByKey.get(key);
    if (!field) return null;
    rendered.add(key);
    return renderField(field, width);
  };

  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
    {template.blocks.map(block => {
      if (block.type === 'SECTION') {
        // Level 1, styled like the "A. THÀNH PHẦN" bar of a CoPlus inspection record.
        return <h5 key={block.id} className={`${REPORT_FORM_WIDTH_CLASS.FULL} -mx-3 mt-1 flex items-center gap-2 border-y border-rule bg-slate-50 px-3 py-2 text-[11px] font-black text-brand-600 first:mt-0`}>
          <span className="tabular-nums">{headingNumbers[block.id]}</span>{block.title}
        </h5>;
      }
      if (block.type === 'SUBSECTION') {
        // Level 2, styled like "I. THÔNG TIN CHUNG VỀ KHÁCH HÀNG".
        return <h6 key={block.id} className={`${REPORT_FORM_WIDTH_CLASS.FULL} mt-1 flex items-center gap-2 border-b border-slate-300 pb-1.5 text-[11px] font-extrabold text-slate-800`}>
          <span className="tabular-nums">{headingNumbers[block.id]}</span>{block.title}
        </h6>;
      }
      if (block.type === 'CAMPAIGN_CONTEXT') {
        return renderCampaignContext ? <React.Fragment key={block.id}>{renderCampaignContext(block)}</React.Fragment> : null;
      }
      if (block.type === 'TEXT') {
        return <p key={block.id} className={`${REPORT_FORM_WIDTH_CLASS.FULL} rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600`}>{block.content}</p>;
      }
      if (block.type === 'DIVIDER') {
        return <hr key={block.id} className={`${REPORT_FORM_WIDTH_CLASS.FULL} border-slate-300`} />;
      }
      if (block.type === 'FIELD') {
        const content = renderOnce(block.fieldKey, block.width);
        return content ? <React.Fragment key={block.id}>{content}</React.Fragment> : null;
      }
      if (block.type === 'FIELD_GROUP') {
        const children = (block.fieldKeys ?? []).map(key => {
          const content = renderOnce(key, 'HALF');
          return content ? <React.Fragment key={key}>{content}</React.Fragment> : null;
        }).filter(Boolean);
        return <div key={block.id} className={`${REPORT_FORM_WIDTH_CLASS.FULL} rounded-md border border-rule bg-white p-3`}>
          <h5 className="mb-3 text-[11px] font-extrabold text-brand-600">{block.title}</h5>
          {children.length
            ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">{children}</div>
            : <ReportFormEmptyState />}
        </div>;
      }
      return null;
    })}

    {orphans.length > 0 && <div className={`${REPORT_FORM_WIDTH_CLASS.FULL} rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3`}>
      <h5 className="mb-3 text-xs font-extrabold text-amber-800">Trường chưa được xếp vào khung mẫu</h5>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        {orphans.map(field => <React.Fragment key={field.fieldKey}>{renderField(field, field.dataType === 'textarea' ? 'FULL' : 'HALF')}</React.Fragment>)}
      </div>
    </div>}
  </div>;
};
