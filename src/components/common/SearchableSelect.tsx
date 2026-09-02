import React from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  /** Dòng phụ hiển thị mờ bên dưới nhãn, ví dụ tên đầy đủ của chi nhánh. */
  detail?: string;
}

/**
 * Bỏ dấu tiếng Việt để gõ "buon ho" vẫn tìm ra "Buôn Hồ".
 *
 * `đ` không phải là `d` cộng dấu nên `NFD` không tách nó ra; phải thay tay, nếu không gõ "dak"
 * sẽ không khớp "Đắk".
 */
const foldDiacritics = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/gi, 'd').toLowerCase();

/**
 * Từ ngần này mục trở lên thì hiện ô tìm. Dưới ngưỡng, mắt quét hết danh sách còn nhanh hơn gõ,
 * nên ô tìm chỉ tổ chiếm chỗ. Danh sách chi nhánh trong vận hành thật luôn vượt xa ngưỡng này.
 */
const SEARCH_THRESHOLD = 5;

interface SearchableSelectProps {
  value: string;
  options: SelectOption[];
  /** Nhãn của lựa chọn rỗng, luôn nằm đầu danh sách. */
  emptyLabel: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value, options, emptyLabel, ariaLabel, onChange, className = '',
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const all = React.useMemo<SelectOption[]>(() => [{ value: '', label: emptyLabel }, ...options], [options, emptyLabel]);
  const showSearch = all.length > SEARCH_THRESHOLD;
  const visible = React.useMemo(() => {
    const needle = foldDiacritics(query.trim());
    if (!needle) return all;
    return all.filter(option => foldDiacritics(`${option.label} ${option.detail ?? ''}`).includes(needle));
  }, [all, query]);

  const selected = all.find(option => option.value === value);

  const close = React.useCallback(() => { setOpen(false); setQuery(''); }, []);

  // Bấm ra ngoài hoặc Tab sang chỗ khác thì đóng lại; một dropdown còn mở khi con trỏ đã đi nơi
  // khác là thứ che mất chính nội dung mà người dùng vừa chuyển sang đọc.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, close]);

  React.useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, visible.findIndex(option => option.value === value)));
    if (showSearch) searchRef.current?.focus();
  }, [open]);

  React.useEffect(() => { setActiveIndex(0); }, [query]);

  // Giữ lựa chọn đang trỏ nằm trong tầm nhìn khi di chuyển bằng bàn phím.
  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (option: SelectOption) => { onChange(option.value); close(); };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(index => (index + step + visible.length) % Math.max(1, visible.length));
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const option = visible[activeIndex];
      if (option) commit(option);
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`} onKeyDown={onKeyDown}>
      {/* Nút xoá là anh em với nút mở, không phải con của nó: một phần tử tương tác lồng trong
          `<button>` là HTML không hợp lệ, và trình đọc màn hình chỉ thấy nút ngoài cùng nên lựa
          chọn "Bỏ chọn" biến mất hoàn toàn với người dùng bàn phím. */}
      <div className={`flex min-h-10 w-full items-center rounded-lg border bg-white transition-colors ${open ? 'border-brand-500' : 'border-rule hover:border-slate-400'}`}>
        <button
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => (open ? close() : setOpen(true))}
          className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-l-lg px-2.5 text-left text-xs font-semibold outline-none ${value ? 'text-slate-800' : 'text-slate-500'}`}
        >
          <span className="min-w-0 flex-1 truncate">{selected?.label ?? emptyLabel}</span>
          {!value && <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />}
        </button>
        {/* Xoá nhanh ngay tại chỗ: bỏ một điều kiện không nên bắt người dùng mở danh sách ra rồi
            đi tìm dòng "tất cả" nằm lẫn giữa các lựa chọn thật. */}
        {value && (
          <button
            type="button"
            aria-label={`Bỏ chọn ${ariaLabel}`}
            onClick={() => onChange('')}
            className="mr-2 grid h-5 w-5 shrink-0 place-items-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 overflow-hidden rounded-xl border border-rule bg-white shadow-raised">
          {showSearch && (
            <div className="relative border-b border-rule">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                ref={searchRef}
                // Ô lọc trong dropdown không phải là dữ liệu người dùng nhập để lưu, nên không được
                // để trình duyệt tự điền vào — nó sẽ nhét email hoặc tên đã lưu vào bộ lọc.
                autoComplete="off"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Gõ để lọc..."
                aria-label={`Tìm trong ${ariaLabel}`}
                className="min-h-9 w-full bg-white pl-8 pr-2.5 text-xs font-semibold text-slate-700 outline-none"
              />
            </div>
          )}
          <ul ref={listRef} role="listbox" aria-label={ariaLabel} className="max-h-56 overflow-y-auto py-1">
            {visible.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value || '__empty'} data-index={index}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => commit(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${index === activeIndex ? 'bg-brand-50' : 'bg-white'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${isSelected ? 'font-bold text-brand-700' : option.value ? 'font-semibold text-slate-700' : 'font-semibold text-slate-500'}`}>{option.label}</span>
                      {option.detail && <span className="block truncate text-[10px] text-slate-400">{option.detail}</span>}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden />}
                  </button>
                </li>
              );
            })}
            {!visible.length && <li className="px-2.5 py-3 text-center text-[11px] text-slate-500">Không có mục nào khớp</li>}
          </ul>
        </div>
      )}
    </div>
  );
};
