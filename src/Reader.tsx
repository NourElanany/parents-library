import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Palette,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { type BookRecord, updateReadingProgress } from './db';
import { THEMES, type ThemeId } from './themes';

// Setup pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface ReaderProps {
  book: BookRecord;
  onBack: () => void;
}

export const Reader: React.FC<ReaderProps> = ({ book, onBack }) => {
  const [currentPage, setCurrentPage] = useState<number>(book.lastReadPage || 1);
  const [totalPages, setTotalPages] = useState<number>(book.totalPages || 1);
  const [zoomLevel, setZoomLevel] = useState<number>(book.zoomLevel || 1.15);
  const [themeId, setThemeId] = useState<ThemeId>((book.theme as ThemeId) || 'sepia');
  const [bookmarks, setBookmarks] = useState<number[]>(book.bookmarks || []);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isJumpModalOpen, setIsJumpModalOpen] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState('');
  const [isRendering, setIsRendering] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<any>(null);
  const debounceSaveTimer = useRef<number | null>(null);

  const theme = THEMES[themeId] || THEMES.sepia;
  const isBookmarked = bookmarks.includes(currentPage);

  // 1. Load PDF Document (Virtual stream from memory)
  useEffect(() => {
    let isCancelled = false;

    async function loadDoc() {
      try {
        setIsRendering(true);
        // Load clean copy of ArrayBuffer
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(book.pdfData),
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
        });

        const doc = await loadingTask.promise;
        if (isCancelled) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
      } catch (err) {
        console.error('Failed to load PDF doc', err);
      }
    }

    loadDoc();

    return () => {
      isCancelled = true;
      if (pdfDocRef.current && (pdfDocRef.current as any).destroy) {
        (pdfDocRef.current as any).destroy();
      }
    };
  }, [book.id, book.pdfData]);

  // 2. High-DPI Vector Render for the current page only
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      setIsRendering(true);
      const page = await pdfDocRef.current.getPage(currentPage);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Base viewport: fit width comfortably on screen
      const containerWidth = Math.min(window.innerWidth - 32, 900);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const baseScale = containerWidth / unscaledViewport.width;
      const effectiveScale = baseScale * zoomLevel;

      // High DPI retina crispness (sharp text for elderly eyes)
      const outputScale = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: effectiveScale });

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(outputScale, outputScale);

      const renderContext: any = {
        canvasContext: ctx,
        viewport,
        enableWebGL: true,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      ctx.restore();
      setIsRendering(false);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Page render error', err);
      }
    }
  }, [currentPage, zoomLevel]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // 3. Auto-save progress seamlessly to IndexedDB
  useEffect(() => {
    if (debounceSaveTimer.current) {
      window.clearTimeout(debounceSaveTimer.current);
    }
    debounceSaveTimer.current = window.setTimeout(() => {
      updateReadingProgress(book.id, {
        lastReadPage: currentPage,
        zoomLevel,
        theme: themeId,
        bookmarks,
      });
    }, 1000);

    return () => {
      if (debounceSaveTimer.current) window.clearTimeout(debounceSaveTimer.current);
    };
  }, [book.id, currentPage, zoomLevel, themeId, bookmarks]);

  // Navigation handlers
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((p) => p + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const toggleBookmark = () => {
    if (isBookmarked) {
      setBookmarks((b) => b.filter((p) => p !== currentPage));
    } else {
      setBookmarks((b) => [...b, currentPage]);
    }
  };

  const handleJumpToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      setCurrentPage(p);
      setIsJumpModalOpen(false);
      setJumpPageInput('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-200 select-none pb-28"
      style={{ backgroundColor: theme.bg }}
    >
      {/* 1. Header (Touch target min 56px, high contrast) */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 shadow-sm border-b"
        style={{
          backgroundColor: theme.headerBg,
          borderColor: 'rgba(0,0,0,0.08)',
          color: theme.textColor,
        }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-lg cursor-pointer active:scale-95 transition-transform"
          style={{ backgroundColor: 'rgba(0,0,0,0.05)' }}
          aria-label="الرجوع للمكتبة"
        >
          <ArrowRight size={26} />
          <span>المكتبة</span>
        </button>

        <div className="flex-1 text-center px-2">
          <h1 className="font-extrabold text-lg sm:text-xl truncate" title={book.title}>
            {book.title}
          </h1>
          <button
            onClick={() => setIsJumpModalOpen(true)}
            className="text-sm sm:text-base font-bold mt-0.5 underline cursor-pointer active:opacity-70"
            style={{ color: theme.subTextColor }}
          >
            صفحة {currentPage} من {totalPages} (انتقال سريع)
          </button>
        </div>

        {/* Bookmark Ribbon */}
        <button
          onClick={toggleBookmark}
          className="flex flex-col items-center justify-center min-w-[58px] min-h-[52px] rounded-2xl cursor-pointer active:scale-95 transition-transform"
          style={{
            backgroundColor: isBookmarked ? '#fef08a' : 'rgba(0,0,0,0.05)',
            color: isBookmarked ? '#854d0e' : theme.textColor,
          }}
          aria-label={isBookmarked ? 'الصفحة محفوظة' : 'حفظ الصفحة'}
        >
          <Bookmark size={24} fill={isBookmarked ? '#ca8a04' : 'none'} />
          <span className="text-xs font-black mt-0.5">{isBookmarked ? 'محفوظة' : 'حفظ'}</span>
        </button>
      </header>

      {/* 2. Page Canvas Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 overflow-x-auto">
        <div
          className="relative rounded-2xl shadow-xl overflow-hidden transition-all duration-150"
          style={{
            backgroundColor: theme.paperBg,
            filter: theme.canvasFilter,
          }}
        >
          {isRendering && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 backdrop-blur-xs">
              <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-3 font-bold text-stone-800 text-lg">جاري تجهيز صفحة الكتاب...</p>
            </div>
          )}

          <canvas ref={canvasRef} className="block max-w-full h-auto" />
        </div>
      </main>

      {/* 3. Floating Quick Action Controls (+ / - / Theme) */}
      <aside className="fixed bottom-24 right-4 z-40 flex flex-col gap-3">
        <button
          onClick={() => setZoomLevel((z) => Math.min(Number((z + 0.15).toFixed(2)), 2.2))}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg flex flex-col items-center justify-center font-bold active:scale-90 transition-transform cursor-pointer"
          style={{ backgroundColor: theme.headerBg, color: theme.textColor }}
          title="تكبير الصفحة"
          aria-label="تكبير"
        >
          <ZoomIn size={26} />
          <span className="text-[10px] font-black">تكبير</span>
        </button>

        <button
          onClick={() => setZoomLevel((z) => Math.max(Number((z - 0.15).toFixed(2)), 0.8))}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg flex flex-col items-center justify-center font-bold active:scale-90 transition-transform cursor-pointer"
          style={{ backgroundColor: theme.headerBg, color: theme.textColor }}
          title="تصغير الصفحة"
          aria-label="تصغير"
        >
          <ZoomOut size={26} />
          <span className="text-[10px] font-black">تصغير</span>
        </button>

        <button
          onClick={() => setZoomLevel(1.15)}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg flex flex-col items-center justify-center font-bold active:scale-90 transition-transform cursor-pointer"
          style={{ backgroundColor: theme.headerBg, color: theme.textColor }}
          title="إعادة ضبط الحجم"
          aria-label="الحجم الأصلي"
        >
          <RotateCcw size={22} />
          <span className="text-[10px] font-black">ضبط</span>
        </button>

        <button
          onClick={() => setIsThemeModalOpen(true)}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shadow-lg flex flex-col items-center justify-center font-bold active:scale-90 transition-transform cursor-pointer"
          style={{ backgroundColor: theme.buttonBg, color: theme.buttonText }}
          title="تغيير ألوان وإضاءة القراءة"
          aria-label="المظهر"
        >
          <Palette size={24} />
          <span className="text-[10px] font-black">المظهر</span>
        </button>
      </aside>

      {/* 4. Giant Bottom Navigation Bar for Senior Ease (64px target height) */}
      <footer
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 border-t shadow-2xl"
        style={{
          backgroundColor: theme.headerBg,
          borderColor: 'rgba(0,0,0,0.08)',
        }}
      >
        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-black text-lg sm:text-xl active:scale-98 transition-transform cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
          style={{ backgroundColor: theme.buttonBg, color: theme.buttonText }}
        >
          <span>التالي</span>
          <ChevronLeft size={28} />
        </button>

        <div className="px-4 text-center font-black text-lg sm:text-xl" style={{ color: theme.textColor }}>
          {currentPage} / {totalPages}
        </div>

        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-black text-lg sm:text-xl active:scale-98 transition-transform cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
          style={{ backgroundColor: theme.buttonBg, color: theme.buttonText }}
        >
          <ChevronRight size={28} />
          <span>السابق</span>
        </button>
      </footer>

      {/* 5. Eye-Care Themes Modal */}
      {isThemeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: theme.headerBg, color: theme.textColor }}
          >
            <h2 className="text-2xl font-black mb-4 text-center">ألوان وإضاءة راحة العينين</h2>
            <div className="flex flex-col gap-3">
              {(Object.keys(THEMES) as ThemeId[]).map((tid) => {
                const item = THEMES[tid];
                const active = tid === themeId;
                return (
                  <button
                    key={tid}
                    onClick={() => {
                      setThemeId(tid);
                      setIsThemeModalOpen(false);
                    }}
                    className="flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer text-right"
                    style={{
                      backgroundColor: item.bg,
                      borderColor: active ? item.accent : 'transparent',
                    }}
                  >
                    <div>
                      <div className="font-extrabold text-lg" style={{ color: item.textColor }}>
                        {item.name}
                      </div>
                      <div className="text-xs font-bold mt-1" style={{ color: item.subTextColor }}>
                        {item.badge}
                      </div>
                    </div>
                    {active && (
                      <span
                        className="px-3 py-1 rounded-full text-xs font-black text-white"
                        style={{ backgroundColor: item.accent }}
                      >
                        مُفعل الآن
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setIsThemeModalOpen(false)}
              className="mt-6 w-full py-3.5 rounded-2xl bg-stone-300 hover:bg-stone-400 font-extrabold text-stone-900 cursor-pointer text-lg"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* 6. Jump to Page Dialog */}
      {isJumpModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleJumpToPage}
            className="w-full max-w-sm rounded-3xl p-6 shadow-2xl"
            style={{ backgroundColor: theme.headerBg, color: theme.textColor }}
          >
            <h3 className="text-2xl font-black mb-2 text-center">انتقال لصفحة محددة</h3>
            <p className="text-sm font-bold text-center mb-4" style={{ color: theme.subTextColor }}>
              أدخل رقم الصفحة من (1 إلى {totalPages})
            </p>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              placeholder={`مثال: ${Math.floor(totalPages / 2)}`}
              className="w-full text-center text-3xl font-black p-3 rounded-2xl border-2 border-stone-400 bg-white text-stone-900 focus:outline-none focus:border-amber-600 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 py-3 rounded-2xl font-black text-lg text-white bg-amber-700 active:scale-95 cursor-pointer"
              >
                انتقال
              </button>
              <button
                type="button"
                onClick={() => setIsJumpModalOpen(false)}
                className="flex-1 py-3 rounded-2xl font-black text-lg bg-stone-300 text-stone-900 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
