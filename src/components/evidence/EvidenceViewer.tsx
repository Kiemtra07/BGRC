import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, Expand, FileDown, Grip,
  Loader2, Minus, Plus, RotateCw, Scan,
} from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { EvidenceObject } from '../../../shared/contracts';
import { api } from '../../services/api';

interface Props {
  evidence: EvidenceObject;
}

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

function useDragToPan() {
  const drag = useRef<DragState | null>(null);
  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const target = event.currentTarget;
      drag.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollLeft: target.scrollLeft,
        scrollTop: target.scrollTop,
      };
      target.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const start = drag.current;
      if (!start || start.pointerId !== event.pointerId) return;
      event.currentTarget.scrollLeft = start.scrollLeft - (event.clientX - start.x);
      event.currentTarget.scrollTop = start.scrollTop - (event.clientY - start.y);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
    },
    onPointerCancel: () => { drag.current = null; },
  };
}

export const EvidenceViewer: React.FC<Props> = ({ evidence }) => {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setBlob(null);
    setError(null);
    api.getEvidenceBlob(evidence)
      .then(result => { if (active) setBlob(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Không thể tải tệp bằng chứng.'); });
    return () => { active = false; };
  }, [evidence.id, evidence.updatedAt]);

  if (error) return <ViewerError message={error} />;
  if (!blob) return <div className="flex h-full min-h-[360px] items-center justify-center" role="status"><Loader2 className="h-7 w-7 animate-spin text-[#006b68]" /><span className="sr-only">Đang tải tệp</span></div>;

  const extension = evidence.fileName.split('.').pop()?.toLowerCase();
  if (evidence.mimeType === 'application/pdf' || extension === 'pdf') {
    return <PdfViewer blob={blob} fileName={evidence.fileName} />;
  }
  if (evidence.mimeType.startsWith('image/')) {
    return <ImageViewer blob={blob} fileName={evidence.fileName} />;
  }
  if (extension === 'xlsx' || evidence.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return <ExcelViewer blob={blob} fileName={evidence.fileName} />;
  }
  return <DownloadFallback blob={blob} fileName={evidence.fileName} />;
};

const PdfViewer: React.FC<{ blob: Blob; fileName: string }> = ({ blob, fileName }) => {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.15);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const panHandlers = useDragToPan();
  const objectUrl = useObjectUrl(blob);

  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | null = null;
    Promise.all([blob.arrayBuffer(), import('pdfjs-dist')]).then(([data, pdfjs]) => {
      if (!active) return null;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      task = pdfjs.getDocument({ data });
      return task.promise;
    }).then(result => {
      if (active && result) {
        setDocument(result);
        setPageNumber(1);
        setError(null);
      }
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : 'Tệp PDF không hợp lệ.'));
    return () => {
      active = false;
      renderTask.current?.cancel();
      if (task) void task.destroy();
    };
  }, [blob]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let active = true;
    renderTask.current?.cancel();
    document.getPage(pageNumber).then(page => {
      if (!active || !canvasRef.current) return;
      const viewport = page.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Trình duyệt không hỗ trợ canvas 2D.');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      renderTask.current = page.render({ canvas, viewport });
      return renderTask.current.promise;
    }).catch(reason => {
      if (active && reason?.name !== 'RenderingCancelledException') {
        setError(reason instanceof Error ? reason.message : 'Không thể dựng trang PDF.');
      }
    });
    return () => { active = false; renderTask.current?.cancel(); };
  }, [document, pageNumber, rotation, scale]);

  const fitWidth = async () => {
    if (!document || !viewportRef.current) return;
    const page = await document.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1, rotation });
    setScale(Math.max(0.5, Math.min(3, (viewportRef.current.clientWidth - 32) / natural.width)));
  };

  const fitPage = async () => {
    if (!document || !viewportRef.current) return;
    const page = await document.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1, rotation });
    const widthScale = (viewportRef.current.clientWidth - 32) / natural.width;
    const heightScale = (viewportRef.current.clientHeight - 32) / natural.height;
    setScale(Math.max(0.35, Math.min(3, widthScale, heightScale)));
  };

  useEffect(() => {
    if (!document) return;
    const frame = window.requestAnimationFrame(() => { void fitPage(); });
    return () => window.cancelAnimationFrame(frame);
  }, [document, rotation]);

  if (error) return <ViewerError message={error} />;

  return (
    <div className="grid h-full min-h-[480px] grid-rows-[auto_minmax(0,1fr)] bg-slate-200" data-testid="pdf-viewer">
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-slate-300 bg-slate-900 px-2 py-2 text-white sm:px-3" aria-label="Thanh công cụ PDF">
        <ToolButton label="Trang trước" onClick={() => setPageNumber(value => Math.max(1, value - 1))} disabled={pageNumber <= 1}><ChevronLeft /></ToolButton>
        <label className="flex h-10 items-center gap-1 rounded-lg bg-white/10 px-2 text-[11px] font-bold">
          <span>Trang</span>
          <input aria-label="Chọn trang" type="number" min={1} max={document?.numPages || 1} value={pageNumber} onChange={event => setPageNumber(Math.max(1, Math.min(document?.numPages || 1, Number(event.target.value) || 1)))} className="h-7 w-12 rounded bg-white px-1 text-center text-slate-900" />
          <span>/ {document?.numPages || '…'}</span>
        </label>
        <ToolButton label="Trang sau" onClick={() => setPageNumber(value => Math.min(document?.numPages || value, value + 1))} disabled={!document || pageNumber >= document.numPages}><ChevronRight /></ToolButton>
        <span className="mx-0.5 h-6 w-px bg-white/20" />
        <ToolButton label="Thu nhỏ" onClick={() => setScale(value => Math.max(0.5, Number((value - 0.15).toFixed(2))))}><Minus /></ToolButton>
        <span className="min-w-12 text-center text-[11px] font-bold">{Math.round(scale * 100)}%</span>
        <ToolButton label="Phóng to" onClick={() => setScale(value => Math.min(3, Number((value + 0.15).toFixed(2))))}><Plus /></ToolButton>
        <ToolButton label="Vừa trang giấy" onClick={fitPage}><Scan /></ToolButton>
        <ToolButton label="Vừa chiều rộng" onClick={fitWidth}><Expand /></ToolButton>
        <ToolButton label="Xoay trang" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw /></ToolButton>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden items-center gap-1 text-[10px] text-slate-300 xl:flex"><Grip className="h-3.5 w-3.5" />Kéo để di chuyển</span>
          {objectUrl && <a href={objectUrl} download={fileName} aria-label="Tải xuống" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10"><Download className="h-4 w-4" /></a>}
        </div>
      </div>
      <div ref={viewportRef} {...panHandlers} className="min-h-0 touch-pan-x touch-pan-y select-none overflow-auto overscroll-contain p-4 [cursor:grab] active:[cursor:grabbing]">
        <div className="flex min-h-full min-w-full items-start justify-center">
          <canvas ref={canvasRef} className="bg-white shadow-xl" aria-label={`Nội dung ${fileName}, trang ${pageNumber}`} />
        </div>
      </div>
    </div>
  );
};

const ExcelViewer: React.FC<{ blob: Blob; fileName: string }> = ({ blob, fileName }) => {
  const [sheets, setSheets] = useState<Array<{ sheet: string; data: unknown[][] }>>([]);
  const [sheetName, setSheetName] = useState('');
  const [zoom, setZoom] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useObjectUrl(blob);

  useEffect(() => {
    let active = true;
    import('read-excel-file/browser').then(module => module.default(blob)).then(result => {
      if (!active) return;
      setSheets(result as Array<{ sheet: string; data: unknown[][] }>);
      setSheetName(result[0]?.sheet || '');
    }).catch(reason => active && setError(reason instanceof Error ? reason.message : 'Không thể đọc tệp Excel.'));
    return () => { active = false; };
  }, [blob]);

  const activeSheet = sheets.find(item => item.sheet === sheetName) || sheets[0];
  if (error) return <ViewerError message={error} />;
  if (!activeSheet) return <div className="flex h-full items-center justify-center" role="status"><Loader2 className="h-7 w-7 animate-spin text-[#006b68]" /></div>;

  return (
    <div className="grid h-full min-h-[480px] grid-rows-[auto_minmax(0,1fr)] bg-white" data-testid="excel-viewer">
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-900 px-3 py-2 text-white" aria-label="Thanh công cụ Excel">
        <label className="flex h-10 items-center gap-2 text-[11px] font-bold">Trang tính
          <select aria-label="Chọn trang tính" value={activeSheet.sheet} onChange={event => setSheetName(event.target.value)} className="h-9 max-w-48 rounded-lg bg-white px-2 text-slate-900">
            {sheets.map(sheet => <option key={sheet.sheet} value={sheet.sheet}>{sheet.sheet}</option>)}
          </select>
        </label>
        <ToolButton label="Thu nhỏ" onClick={() => setZoom(value => Math.max(70, value - 10))}><Minus /></ToolButton>
        <span className="min-w-12 text-center text-[11px] font-bold">{zoom}%</span>
        <ToolButton label="Phóng to" onClick={() => setZoom(value => Math.min(160, value + 10))}><Plus /></ToolButton>
        {objectUrl && <a href={objectUrl} download={fileName} aria-label="Tải xuống" className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10"><Download className="h-4 w-4" /></a>}
      </div>
      <div className="min-h-0 overflow-auto overscroll-contain bg-slate-100" tabIndex={0} aria-label={`Nội dung Excel ${fileName}`}>
        <table className="border-separate border-spacing-0 bg-white text-left" style={{ fontSize: `${zoom}%` }}>
          <tbody>
            {activeSheet.data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className="sticky left-0 z-20 min-w-12 border-b border-r border-slate-300 bg-slate-200 px-2 py-1 text-center text-[10px] font-bold text-slate-500">{rowIndex + 1}</th>
                {row.map((cell, columnIndex) => (
                  <td key={columnIndex} className={`min-w-32 max-w-80 whitespace-pre-wrap border-b border-r border-slate-200 px-2 py-1.5 text-[11px] text-slate-800 ${rowIndex === 0 ? 'sticky top-0 z-10 bg-teal-50 font-bold text-[#006b68]' : 'bg-white'}`}>{formatCell(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ImageViewer: React.FC<{ blob: Blob; fileName: string }> = ({ blob, fileName }) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const objectUrl = useObjectUrl(blob);
  const panHandlers = useDragToPan();
  if (!objectUrl) return null;
  return (
    <div className="grid h-full min-h-[480px] grid-rows-[auto_minmax(0,1fr)] bg-slate-200">
      <div className="flex min-h-12 items-center gap-1.5 bg-slate-900 px-3 py-2 text-white">
        <ToolButton label="Thu nhỏ" onClick={() => setScale(value => Math.max(0.5, value - 0.15))}><Minus /></ToolButton>
        <span className="min-w-12 text-center text-[11px] font-bold">{Math.round(scale * 100)}%</span>
        <ToolButton label="Phóng to" onClick={() => setScale(value => Math.min(3, value + 0.15))}><Plus /></ToolButton>
        <ToolButton label="Xoay trang" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw /></ToolButton>
        <a href={objectUrl} download={fileName} aria-label="Tải xuống" className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10"><Download className="h-4 w-4" /></a>
      </div>
      <div {...panHandlers} className="min-h-0 select-none overflow-auto p-4 [cursor:grab] active:[cursor:grabbing]">
        <div className="flex min-h-full min-w-full items-center justify-center" style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}>
          <img src={objectUrl} alt={fileName} draggable={false} className="max-h-none max-w-none object-contain shadow-xl" style={{ width: `${Math.min(100, 100 / scale)}%`, transform: `rotate(${rotation}deg)` }} />
        </div>
      </div>
    </div>
  );
};

const ToolButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean; children: React.ReactElement }> = ({ label, onClick, disabled, children }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35">
    {React.cloneElement(children, { className: 'h-4 w-4' } as React.SVGAttributes<SVGElement>)}
  </button>
);

const ViewerError: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="flex h-full min-h-[360px] flex-col items-center justify-center p-8 text-center text-xs text-slate-600">
    <AlertTriangle className="mb-3 h-8 w-8 text-amber-600" />
    <p className="max-w-sm font-semibold">{message}</p>
    <p className="mt-2 text-slate-500">Kiểm tra quyền truy cập hoặc tải lại tệp từ hồ sơ.</p>
  </div>
);

const DownloadFallback: React.FC<{ blob: Blob; fileName: string }> = ({ blob, fileName }) => {
  const objectUrl = useObjectUrl(blob);
  return <div className="flex h-full min-h-[360px] flex-col items-center justify-center p-8 text-center">
    <FileDown className="mb-3 h-9 w-9 text-[#006b68]" />
    <p className="text-sm font-bold text-slate-900">Định dạng này chưa hỗ trợ xem trực tiếp</p>
    {objectUrl && <a href={objectUrl} download={fileName} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#006b68] px-4 py-2 text-xs font-bold text-white"><Download className="h-4 w-4" />Tải tệp xuống</a>}
  </div>;
};

function useObjectUrl(blob: Blob | null) {
  const url = useMemo(() => blob ? URL.createObjectURL(blob) : null, [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('vi-VN');
  return String(value);
}
