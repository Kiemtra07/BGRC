import React, { useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, BriefcaseBusiness, Eye, FileSpreadsheet, Heading2, Heading3, LayoutGrid, Minus, Paperclip, Plus, Text, Trash2 } from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';
import { DynamicFieldDefinition, DynamicSchemaConfig, FieldDataType, ReportFormBlock, ReportFormBlockType, ReportFormBlockWidth } from '../../../../shared/contracts';
import { analyzeExcelTemplateFile, applyExcelColumnRules, buildReportTemplateFromExcelRows } from '../../../lib/report-template';
import {
  REPORT_FORM_WIDTH_CLASS, ReportFieldLabel, ReportFormBlockLayout, danglingReportFormBlocks,
  defaultReportFormTemplate, resolveReportFormTemplate, unplacedReportFormFields,
} from '../../reports/ReportFormBlockLayout';

interface Props { value: DynamicSchemaConfig; onChange: (value: DynamicSchemaConfig) => void; }

const fieldTypeLabels: Record<FieldDataType, string> = {
  string: 'Văn bản', textarea: 'Văn bản dài', number: 'Số', currency: 'Số tiền', date: 'Ngày',
  select: 'Danh sách chọn', file: 'Tệp minh chứng (tải sau)',
};
const blockLabels: Record<ReportFormBlockType, string> = {
  CAMPAIGN_CONTEXT: 'Thông tin đoàn kiểm tra', SECTION: 'Phần chính (A.)', SUBSECTION: 'Mục con (I.)', TEXT: 'Đoạn hướng dẫn', FIELD: 'Trường nhập', FIELD_GROUP: 'Nhóm trường', DIVIDER: 'Đường phân cách',
};
const defaultTemplate = (fields: DynamicFieldDefinition[]) => defaultReportFormTemplate('Mẫu nhập báo cáo', fields);

/** `truong_${fields.length + 1}` collides after a delete; walk forward until the key is free. */
const nextFieldKey = (fields: DynamicFieldDefinition[]): { fieldKey: string; label: string } => {
  const used = new Set(fields.map(field => field.fieldKey));
  let suffix = fields.length + 1;
  while (used.has(`truong_${suffix}`)) suffix += 1;
  return { fieldKey: `truong_${suffix}`, label: `Trường ${suffix}` };
};

export const FormSchemaEditor: React.FC<Props> = ({ value, onChange }) => {
  const [excelError, setExcelError] = useState<string>();
  const [previewVisible, setPreviewVisible] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const template = value.formTemplate ?? defaultTemplate(value.fields);
  const setTemplate = (blocks: ReportFormBlock[], patch = {}) => onChange({ ...value, formTemplate: { ...template, ...patch, blocks } });

  const duplicateKeys = value.fields
    .map(field => field.fieldKey)
    .filter((key, index, keys) => keys.indexOf(key) !== index);
  const invalidKeys = value.fields.filter(field => !/^[a-z][a-z0-9_]{1,79}$/.test(field.fieldKey)).map(field => field.fieldKey || '(trống)');
  const unplacedFields = unplacedReportFormFields(value.fields, template.blocks);
  const danglingBlocks = danglingReportFormBlocks(value.fields, template.blocks);

  const updateField = (index: number, patch: Partial<DynamicFieldDefinition>) => {
    const oldKey = value.fields[index].fieldKey;
    const fields = value.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field);
    // `patch.fieldKey` can legitimately be '' while the admin retypes it. Rename the blocks anyway,
    // otherwise they stay pinned to a key that no longer exists and the whole config fails to save.
    const renaming = patch.fieldKey !== undefined && patch.fieldKey !== oldKey;
    const blocks = renaming
      ? template.blocks.map(block => ({
        ...block,
        fieldKey: block.fieldKey === oldKey ? patch.fieldKey : block.fieldKey,
        fieldKeys: block.fieldKeys?.map(key => key === oldKey ? patch.fieldKey! : key),
      }))
      : template.blocks;
    onChange({ ...value, fields, formTemplate: value.formTemplate ? { ...template, blocks } : undefined });
  };
  const addField = () => {
    const { fieldKey, label } = nextFieldKey(value.fields);
    const field: DynamicFieldDefinition = { fieldKey, label, dataType: 'string', isRequired: false, excelHeaderAliases: [], displayOrder: value.fields.length + 1, showInTableGrid: true };
    onChange({ ...value, fields: [...value.fields, field], formTemplate: { ...template, blocks: [...template.blocks, { id: `field_${crypto.randomUUID()}`, type: 'FIELD', fieldKey: field.fieldKey, width: 'HALF' }] } });
  };
  const removeField = (index: number) => {
    const key = value.fields[index].fieldKey;
    const blocks = template.blocks.flatMap(block => block.type === 'FIELD' && block.fieldKey === key ? [] : [{ ...block, fieldKeys: block.fieldKeys?.filter(fieldKey => fieldKey !== key) }]).filter(block => block.type !== 'FIELD_GROUP' || block.fieldKeys?.length);
    onChange({ ...value, fields: value.fields.filter((_, fieldIndex) => fieldIndex !== index), formTemplate: { ...template, blocks } });
  };
  const addBlock = (type: ReportFormBlockType) => {
    const id = `${type.toLowerCase()}_${crypto.randomUUID()}`;
    const block: ReportFormBlock = type === 'CAMPAIGN_CONTEXT' ? { id, type, title: 'Đoàn kiểm tra áp dụng', width: 'FULL' }
      : type === 'SECTION' ? { id, type, title: 'THÀNH PHẦN', width: 'FULL' }
      : type === 'SUBSECTION' ? { id, type, title: 'Thông tin chung', width: 'FULL' }
      : type === 'TEXT' ? { id, type, content: 'Nhập nội dung hướng dẫn.', width: 'FULL' }
        // CoPlus records lay fields out three to a row, so a new field block starts at a third.
        : type === 'FIELD' ? { id, type, fieldKey: value.fields[0]?.fieldKey, width: 'THIRD' }
          : type === 'FIELD_GROUP' ? { id, type, title: 'Nhóm thông tin', fieldKeys: value.fields.slice(0, 4).map(field => field.fieldKey), width: 'FULL' }
            : { id, type, width: 'FULL' };
    setTemplate([...template.blocks, block]);
  };
  const updateBlock = (index: number, patch: Partial<ReportFormBlock>) => setTemplate(template.blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block));
  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= template.blocks.length) return;
    const blocks = [...template.blocks]; [blocks[index], blocks[target]] = [blocks[target], blocks[index]]; setTemplate(blocks);
  };
  const importExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      setExcelError(undefined);
      const [rows, arrayBuffer] = await Promise.all([readSheet(file), file.arrayBuffer()]);
      const generated = buildReportTemplateFromExcelRows(rows as unknown[][], file.name);
      if (!generated.fields.length) throw new Error('Không tìm thấy dòng tiêu đề nào trong mẫu Excel.');
      const rules = await analyzeExcelTemplateFile(arrayBuffer, generated.excelHeaderRowIndex);
      const applied = applyExcelColumnRules(generated, rules);
      onChange({
        ...applied,
        tableName: value.tableName || generated.tableName,
        // The Excel template supplies fields and blocks; the presentation choices stay the admin's.
        formTemplate: {
          ...applied.formTemplate!,
          presentationMode: template.presentationMode,
          allowEvidenceAttachments: template.allowEvidenceAttachments,
        },
      });
    }
    catch (reason) { setExcelError(reason instanceof Error ? reason.message : 'Không thể đọc mẫu Excel.'); }
    finally { event.target.value = ''; }
  };

  return <section className="space-y-5" data-testid="report-form-cms">
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-slate-50 p-3 lg:flex-row lg:items-end">
      <label className="flex-1 text-xs font-bold text-slate-700">Tên mẫu trang<input value={template.name} onChange={event => setTemplate(template.blocks, { name: event.target.value })} className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2 text-xs" /></label>
      <label className="flex-1 text-xs font-bold text-slate-700">Tên bảng dữ liệu<input value={value.tableName} onChange={event => onChange({ ...value, tableName: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2 font-mono text-xs" /></label>
      <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white"><FileSpreadsheet className="h-4 w-4" />Tạo từ Excel mẫu</button>
      <input ref={fileInput} type="file" accept=".xlsx,.xls" onChange={importExcel} className="hidden" />
    </div>
    {excelError && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{excelError}</div>}
    {template.source === 'EXCEL' && <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">Đã tạo từ <strong>{template.sourceFileName}</strong> · dòng tiêu đề {value.excelHeaderRowIndex} · dữ liệu từ dòng {value.dataStartRowIndex}.</div>}

    {(duplicateKeys.length > 0 || invalidKeys.length > 0 || danglingBlocks.length > 0 || unplacedFields.length > 0) && <div role="status" className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <p className="flex items-center gap-2 font-extrabold"><AlertTriangle className="h-4 w-4" />Cần kiểm tra trước khi lưu</p>
      {duplicateKeys.length > 0 && <p>Mã trường bị trùng: <strong>{[...new Set(duplicateKeys)].join(', ')}</strong>. Mỗi trường phải có mã riêng.</p>}
      {invalidKeys.length > 0 && <p>Mã trường chưa hợp lệ: <strong>{[...new Set(invalidKeys)].join(', ')}</strong>. Mã phải bắt đầu bằng chữ thường và dài từ 2 ký tự.</p>}
      {danglingBlocks.length > 0 && <p><strong>{danglingBlocks.length} khối</strong> đang gắn với trường không còn tồn tại. Chọn lại trường hoặc xóa khối đó.</p>}
      {unplacedFields.length > 0 && <p><strong>{unplacedFields.map(field => field.label).join(', ')}</strong> chưa được xếp vào khung mẫu nên sẽ hiện ở cuối biểu mẫu. Thêm khối “Trường nhập” để đặt đúng vị trí.</p>}
    </div>}

    <div className="grid gap-3 rounded-xl border border-rule bg-white p-3 md:grid-cols-[minmax(220px,1fr)_minmax(180px,.8fr)_auto] md:items-end">
      <label className="text-xs font-bold text-slate-700">Màn hình người dùng
        <select value={template.presentationMode ?? 'CASE_REVIEW'} onChange={event => setTemplate(template.blocks, { presentationMode: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-rule bg-white px-3 text-xs">
          <option value="CASE_REVIEW">Dạng hồ sơ kiểm soát</option>
          <option value="EXCEL_GRID">Dạng bảng Excel</option>
          <option value="FORM_ONLY">Dạng form nhập liệu</option>
        </select>
      </label>
      <label className="flex min-h-10 items-center gap-2 rounded-lg bg-slate-50 px-3 text-xs font-semibold text-slate-700">
        <input type="checkbox" checked={template.allowEvidenceAttachments ?? true} onChange={event => setTemplate(template.blocks, { allowEvidenceAttachments: event.target.checked })} />
        <Paperclip className="h-4 w-4 text-brand-600" />Cho phép đính kèm
      </label>
      <button type="button" onClick={() => setPreviewVisible(current => !current)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brand-500 px-3 text-xs font-bold text-brand-600"><Eye className="h-4 w-4" />Xem trước người dùng</button>
    </div>

    {previewVisible && <PresentationPreview value={value} />}

    <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-rule bg-white p-3"><h4 className="text-xs font-extrabold text-slate-900">Thư viện khối</h4><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
        {([['CAMPAIGN_CONTEXT', BriefcaseBusiness], ['SECTION', Heading2], ['SUBSECTION', Heading3], ['TEXT', Text], ['FIELD', Plus], ['FIELD_GROUP', LayoutGrid], ['DIVIDER', Minus]] as const).map(([type, Icon]) => {
          // A block that places a field is useless before any field exists, but a greyed-out button
          // with no reason reads as a broken screen — so say what unlocks it.
          const needsField = (type === 'FIELD' || type === 'FIELD_GROUP') && value.fields.length === 0;
          return <button key={type} type="button" disabled={needsField} title={needsField ? 'Thêm ít nhất một trường ở mục “Trường dữ liệu của form” bên dưới trước.' : undefined} onClick={() => addBlock(type)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rule px-3 py-2 text-left text-xs font-bold text-slate-700 hover:border-brand-500 hover:bg-brand-50 disabled:opacity-40"><Icon className="h-4 w-4 text-brand-600" />{blockLabels[type]}</button>;
        })}
      </div>
      {value.fields.length === 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-semibold leading-relaxed text-amber-800">Chưa có trường nào nên khối “Trường nhập” và “Nhóm trường” đang tắt. Thêm trường ở mục “Trường dữ liệu của biểu mẫu” bên dưới để bật.</p>}
      </aside>
      <div className="min-w-0 rounded-xl border border-rule bg-slate-100 p-3"><div className="mb-3 flex items-center justify-between gap-2"><h4 className="text-xs font-extrabold text-slate-900">Khung mẫu báo cáo</h4><span className="text-[11px] text-slate-500">{template.blocks.length} khối · {value.fields.length} trường</span></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
        {template.blocks.map((block, index) => <div key={block.id} className={`rounded-lg border border-rule bg-white p-3 shadow-panel ${block.width === 'FULL' ? 'sm:col-span-6' : block.width === 'HALF' ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
          <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-black text-brand-600">{blockLabels[block.type]}</span><span className="flex"><button type="button" aria-label="Đưa khối lên" onClick={() => moveBlock(index, -1)} disabled={index === 0} className="p-1 text-slate-400 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" aria-label="Đưa khối xuống" onClick={() => moveBlock(index, 1)} disabled={index === template.blocks.length - 1} className="p-1 text-slate-400 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" aria-label="Xóa khối" onClick={() => setTemplate(template.blocks.filter((_, blockIndex) => blockIndex !== index))} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></span></div>
          {(block.type === 'CAMPAIGN_CONTEXT' || block.type === 'SECTION' || block.type === 'SUBSECTION' || block.type === 'FIELD_GROUP') && <input aria-label={`Tiêu đề khối ${index + 1}`} value={block.title ?? ''} onChange={event => updateBlock(index, { title: event.target.value })} className="w-full rounded-md border border-rule px-2 py-1.5 text-xs font-bold" />}
          {block.type === 'CAMPAIGN_CONTEXT' && <div className="mt-2 rounded-lg bg-brand-50 p-2 text-[11px] text-brand-700">Hiển thị tên, quyết định, thời gian, trưởng đoàn và phạm vi chi nhánh của chuyên đề đang chọn.</div>}
          {block.type === 'TEXT' && <textarea aria-label={`Nội dung khối ${index + 1}`} rows={2} value={block.content ?? ''} onChange={event => updateBlock(index, { content: event.target.value })} className="w-full rounded-md border border-rule px-2 py-1.5 text-xs" />}
          {block.type === 'FIELD' && <select aria-label={`Trường của khối ${index + 1}`} value={value.fields.some(field => field.fieldKey === block.fieldKey) ? block.fieldKey : ''} onChange={event => updateBlock(index, { fieldKey: event.target.value })} className={`w-full rounded-md border bg-white px-2 py-1.5 text-xs ${value.fields.some(field => field.fieldKey === block.fieldKey) ? 'border-rule' : 'border-amber-400'}`}><option value="">Chưa chọn trường</option>{value.fields.map(field => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select>}
          {block.type === 'FIELD_GROUP' && <div className="mt-2 flex flex-wrap gap-2">{value.fields.map(field => <label key={field.fieldKey} className="inline-flex items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={block.fieldKeys?.includes(field.fieldKey) ?? false} onChange={event => updateBlock(index, { fieldKeys: event.target.checked ? [...(block.fieldKeys ?? []), field.fieldKey] : block.fieldKeys?.filter(key => key !== field.fieldKey) })} />{field.label}</label>)}</div>}
          {block.type === 'DIVIDER' && <hr className="my-3 border-slate-300" />}
          <select aria-label={`Độ rộng khối ${index + 1}`} value={block.width} onChange={event => updateBlock(index, { width: event.target.value as ReportFormBlock['width'] })} className="mt-2 rounded-md border border-rule bg-white px-2 py-1 text-[10px]"><option value="FULL">Toàn hàng</option><option value="HALF">Nửa hàng</option><option value="THIRD">Một phần ba</option></select>
        </div>)}
        {template.blocks.length === 0 && <div className="sm:col-span-6 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-xs text-slate-500">Chọn khối bên trái hoặc tạo khung từ mẫu Excel.</div>}
      </div></div>
    </div>

    <div className="rounded-xl border border-rule p-3"><div className="mb-3 flex items-center justify-between gap-2"><div><h4 className="text-xs font-extrabold text-slate-900">Trường dữ liệu của form</h4><p className="mt-1 text-[11px] text-slate-500">Chỉ quản trị viên cấu hình; người nhập báo cáo chỉ thấy tên trường.</p></div><button type="button" onClick={addField} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand-500 px-3 py-2 text-xs font-bold text-brand-600"><Plus className="h-4 w-4" />Thêm trường</button></div>
      <div className="space-y-2">{value.fields.map((field, index) => <div key={`${field.fieldKey}-${index}`} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-2 md:grid-cols-[minmax(150px,1fr)_minmax(120px,.8fr)_140px_auto_auto_auto] md:items-end">
        <label className="text-[11px] font-bold text-slate-600">Tên hiển thị<input value={field.label} onChange={event => updateField(index, { label: event.target.value })} className="mt-1 w-full rounded-md border border-rule bg-white px-2 py-2 text-xs" /></label>
        <label className="text-[11px] font-bold text-slate-600">Mã trường<input value={field.fieldKey} onChange={event => updateField(index, { fieldKey: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} className="mt-1 w-full rounded-md border border-rule bg-white px-2 py-2 font-mono text-xs" /></label>
        <label className="text-[11px] font-bold text-slate-600">Kiểu dữ liệu<select value={field.dataType} onChange={event => updateField(index, { dataType: event.target.value as FieldDataType, isRequired: event.target.value === 'file' ? false : field.isRequired, dropdownOptions: event.target.value === 'select' ? [{ label: 'Lựa chọn 1', value: 'option_1' }] : undefined })} className="mt-1 w-full rounded-md border border-rule bg-white px-2 py-2 text-xs">{Object.entries(fieldTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
        <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={field.isRequired} onChange={event => updateField(index, { isRequired: event.target.checked })} />Bắt buộc</label>
        <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={field.isEmphasized ?? false} onChange={event => updateField(index, { isEmphasized: event.target.checked })} />In đậm nhãn</label>
        <button type="button" aria-label={`Xóa ${field.label}`} onClick={() => removeField(index)} className="min-h-10 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
        {field.dataType === 'select' && <label className="text-[11px] font-bold text-slate-600 md:col-span-6">Các lựa chọn, mỗi dòng một giá trị<textarea rows={2} value={(field.dropdownOptions ?? []).map(option => option.label).join('\n')} onChange={event => updateField(index, { dropdownOptions: event.target.value.split('\n').map(item => item.trim()).filter(Boolean).map(item => ({ label: item, value: item.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_') })) })} className="mt-1 w-full rounded-md border border-rule bg-white px-2 py-2 text-xs" /></label>}
      </div>)}</div>
    </div>
  </section>;
};

const placeholderText = (field: DynamicFieldDefinition): string => {
  if (field.dataType === 'file') return 'Tải tệp tại hồ sơ sau khi tạo.';
  if (field.dataType === 'select') return field.dropdownOptions?.[0]?.label ?? 'Chọn...';
  if (field.dataType === 'date') return 'dd/mm/yyyy';
  if (field.dataType === 'number' || field.dataType === 'currency') return '0';
  return 'Nhập dữ liệu...';
};

const PreviewControl: React.FC<{ field: DynamicFieldDefinition }> = ({ field }) => (
  <span className={`block rounded-md border border-rule bg-slate-50 px-2 py-2 text-[11px] font-normal text-slate-400 ${field.dataType === 'textarea' ? 'min-h-16' : 'min-h-9'}`}>
    {placeholderText(field)}
  </span>
);

/**
 * Renders the exact block layout an end user will see, through the same component the runtime form
 * uses, so the preview cannot drift from the real capture screen.
 */
const PresentationPreview: React.FC<{ value: DynamicSchemaConfig }> = ({ value }) => {
  const template = resolveReportFormTemplate(value);
  const mode = template.presentationMode ?? 'CASE_REVIEW';
  const modeLabel = mode === 'CASE_REVIEW' ? 'Dạng hồ sơ kiểm soát' : mode === 'EXCEL_GRID' ? 'Dạng bảng Excel' : 'Dạng form nhập liệu';
  const allowsEvidence = template.allowEvidenceAttachments ?? true;

  const renderField = (field: DynamicFieldDefinition, width: ReportFormBlockWidth) => {
    const span = field.dataType === 'textarea' ? REPORT_FORM_WIDTH_CLASS.FULL : REPORT_FORM_WIDTH_CLASS[width];
    return <label className={span}>
      <ReportFieldLabel label={field.label} required={field.isRequired && field.dataType !== 'file'} emphasized={field.isEmphasized} />
      <span className="mt-1 block"><PreviewControl field={field} /></span>
      {field.helpText && <span className="mt-1 block text-[10px] font-normal text-slate-500">{field.helpText}</span>}
    </label>;
  };

  const renderCampaignContext = () => <div className={`${REPORT_FORM_WIDTH_CLASS.FULL} rounded-lg border border-brand-200 bg-brand-50 p-3 text-[11px]`}>
    <strong className="text-brand-600">Thông tin chuyên đề</strong>
    <div className="mt-2 grid gap-2 text-slate-600 sm:grid-cols-3"><span>Tên chuyên đề</span><span>Quyết định</span><span>Thời gian kiểm tra</span></div>
  </div>;

  return <section className="overflow-hidden rounded-xl border border-brand-200 bg-slate-50" aria-label="Bản xem trước form báo cáo">
    <header className="flex flex-wrap items-center justify-between gap-2 bg-brand-500 px-4 py-3 text-white"><div><p className="text-[10px] font-black text-teal-100">Xem trước người dùng</p><h4 className="mt-0.5 text-sm font-black">{template.name}</h4></div><span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold">{modeLabel} · {allowsEvidence ? 'Có đính kèm' : 'Không đính kèm'}</span></header>
    <div className={`grid gap-3 p-3 ${mode === 'CASE_REVIEW' ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,.7fr)]' : ''}`}>
      <div className="min-w-0 rounded-lg bg-white p-3">
        {value.fields.length === 0 && template.blocks.length === 0
          ? <p className="py-8 text-center text-[11px] text-slate-500">Chưa có nội dung nào trong mẫu. Thêm khối hoặc trường dữ liệu để xem trước.</p>
          : <ReportFormBlockLayout
            schema={value}
            template={template}
            renderField={renderField}
            renderGridCell={field => <PreviewControl field={field} />}
            renderCampaignContext={renderCampaignContext}
          />}
      </div>
      {mode === 'CASE_REVIEW' && <aside className="rounded-lg border border-rule bg-white p-3"><p className="text-[10px] font-black text-brand-600">Nội dung cần giải trình</p><div className="mt-3 h-20 rounded-lg bg-slate-100" />{allowsEvidence ? <div className="mt-3 rounded-lg border border-dashed border-brand-300 p-3 text-center text-[10px] font-bold text-brand-600">Khu vực tài liệu</div> : <p className="mt-3 text-[10px] text-slate-500">Mẫu này không yêu cầu tài liệu đính kèm.</p>}</aside>}
    </div>
  </section>;
};
