import React, { useEffect, useRef, useState, useCallback } from 'react';
import mupdf from './mupdfEngine';
import {
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Palette,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { type BookRecord, getSavedProgress, saveBookmarkProgress } from './db';
import { THEMES, type ThemeId } from './themes';

interface ReaderProps {
  book: BookRecord;
  onBack: () => void;
}

export const Reader: React.FC<ReaderProps> = ({ book, onBack }) => {
  // Current active page during browsing
  const [currentPage, setCurrentPage] = useState<number>(1);
  // Saved permanent bookmark page (only changes when user explicitly taps Save)
  const [savedBookmarkPage, setSavedBookmarkPage] = useState<number>(book.lastReadPage || 1);
  const [totalPages, setTotalPages] = useState<number>(book.totalPages || 1);
  const [zoomLevel, setZoomLevel] = useState<number>(book.zoomLevel || 1.15);
  const [baseDisplayWidth, setBaseDisplayWidth] = useState<number>(600);
  const [themeId, setThemeId] = useState<ThemeId>((book.theme as ThemeId) || 'sepia');
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isJumpModalOpen, setIsJumpModalOpen] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState('');
  const [isRendering, setIsRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mupdfDocRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  const theme = THEMES[themeId] || THEMES.sepia;
  const isCurrentPageSaved = savedBookmarkPage === currentPage;

  // 1. Initialize MuPDF Document (Local ArrayBuffer or fetch online URL)
  useEffect(() => {
    isMountedRef.current = true;
    let docInstance: any = null;

    async function initDocument() {
      try {
        setIsRendering(true);
        setRenderError(null);

        // Check if there is saved bookmark progress in DB
        const progress = await getSavedProgress(book.id);
        const startPage = progress?.lastReadPage || book.lastReadPage || 1;
        setSavedBookmarkPage(startPage);
        setCurrentPage(startPage);
        if (progress?.zoomLevel) setZoomLevel(progress.zoomLevel);
        if (progress?.theme) setThemeId(progress.theme as ThemeId);

        let pdfBuffer: ArrayBuffer;
        if (book.pdfData) {
          pdfBuffer = book.pdfData;
        } else if (book.pdfUrl) {
          const res = await fetch(book.pdfUrl);
          if (!res.ok) throw new Error('فشل تحميل ملف الكتاب من الخادم');
          pdfBuffer = await res.arrayBuffer();
        } else {
          throw new Error('لا توجد بيانات متاحة لهذا الكتاب');
        }

        if (!isMountedRef.current) return;

        // Open Document in MuPDF WebAssembly
        docInstance = mupdf.Document.openDocument(pdfBuffer, 'application/pdf');
        mupdfDocRef.current = docInstance;

        const count = docInstance.countPages();
        setTotalPages(count);

        // Render target page
        renderPage(docInstance, startPage);
      } catch (err: any) {
        console.error('MuPDF load error:', err);
        if (isMountedRef.current) {
          setRenderError(err.message || 'حدث خطأ أثناء فتح صفحات الكتاب');
          setIsRendering(false);
        }
      }
    }

    initDocument();

    return () => {
      isMountedRef.current = false;
      if (mupdfDocRef.current) {
        try {
          mupdfDocRef.current.destroy();
        } catch (_) {}
      }
      mupdfDocRef.current = null;
    };
  }, [book.id]);

  // 2. High-Performance, Mobile-Safe Native Vector Arabic Rendering with Strict Memory Cleanup
  const renderPage = useCallback(
    async (docOverride?: any, pageNum?: number) => {
      const doc = docOverride || mupdfDocRef.current;
      const targetPage = pageNum ?? currentPage;

      if (!doc || !canvasRef.current) return;

      let page: any = null;
      let pixmap: any = null;

      try {
        setIsRendering(true);
        const pageIndex = Math.max(0, Math.min(targetPage - 1, totalPages - 1));
        page = doc.loadPage(pageIndex);
        const bounds = page.getBounds(); // [x0, y0, x1, y1]
        const origWidth = bounds[2] - bounds[0] || 600;

        // Optimal container width and DPR bounded strictly for mobile memory safety
        const containerWidth = Math.min(window.innerWidth - 24, 850);
        setBaseDisplayWidth(containerWidth);

        // DPR capped at 2.0 to prevent mobile canvas GPU crashes
        const dpr = Math.min(window.devicePixelRatio || 1.5, 2.0);
        // Canvas pixel width capped at 1200px max (lightweight ~3-4MB RAM instead of 70MB!)
        const maxCanvasWidth = Math.min(Math.floor(containerWidth * dpr), 1200);
        const effectiveScale = maxCanvasWidth / origWidth;

        const matrix = mupdf.Matrix.scale(effectiveScale, effectiveScale);
        // RGBA pixmap for direct canvas blit
        pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, true);
        const width = pixmap.getWidth();
        const height = pixmap.getHeight();
        const pixels = pixmap.getPixels();

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set internal canvas resolution
        canvas.width = width;
        canvas.height = height;

        const imgData = new ImageData(pixels, width, height);
        ctx.putImageData(imgData, 0, 0);

        setIsRendering(false);
      } catch (err) {
        console.error('MuPDF renderPage error:', err);
        setIsRendering(false);
      } finally {
        // ALWAYS destroy C++ WebAssembly objects immediately to prevent memory leaks and crashes!
        if (pixmap) {
          try {
            pixmap.destroy();
          } catch (_) {}
        }
        if (page) {
          try {
            page.destroy();
          } catch (_) {}
        }
      }
    },
    [currentPage, totalPages]
  );

  // Page flipping: renders new page cleanly and smoothly
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    renderPage(mupdfDocRef.current, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Instant, zero-memory GPU CSS Zooming (Never crashes, never freezes!)
  const handleZoom = (delta: number) => {
    const newZoom = Math.min(Math.max(0.7, zoomLevel + delta), 2.5);
    setZoomLevel(newZoom);
  };

  const handleResetZoom = () => {
    setZoomLevel(1.15);
  };

  // 3. Explicit Bookmark Save Function (Requested by User)
  const handleExplicitSaveBookmark = async () => {
    try {
      await saveBookmarkProgress(book.id, {
        lastReadPage: currentPage,
        zoomLevel,
        theme: themeId,
      });
      setSavedBookmarkPage(currentPage);

      setSaveToast(`✓ تم حفظ علامة القراءة عند صفحة ${currentPage}. سيبدأ الكتاب دائماً من هنا.`);
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      console.error('Failed to save bookmark:', err);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col transition-colors duration-300 font-sans"
      style={{ backgroundColor: theme.bg, color: theme.textColor }}
    >
      {/* Toast Notification for Bookmark Save */}
      {saveToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-800 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-base sm:text-lg font-bold border-2 border-emerald-400 animate-bounce">
          <CheckCircle2 className="w-6 h-6 text-emerald-300 shrink-0" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header
        className="sticky top-0 z-40 px-3 py-2.5 sm:px-6 sm:py-3 shadow-md flex items-center justify-between border-b"
        style={{
          backgroundColor: theme.headerBg,
          borderColor: 'rgba(0,0,0,0.08)',
        }}
      >
        {/* Bookmark Save Button */}
        <button
          onClick={handleExplicitSaveBookmark}
          title="حفظ موضع القراءة الحالي للعودة إليه دائماً"
          className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-black text-sm sm:text-base transition-all shadow-sm active:scale-95 border ${
            isCurrentPageSaved
              ? 'bg-amber-500 text-stone-900 border-amber-600 shadow-amber-500/20'
              : 'bg-stone-100 hover:bg-amber-100 text-stone-800 border-stone-300'
          }`}
        >
          {isCurrentPageSaved ? (
            <>
              <BookmarkCheck className="w-5 h-5 text-stone-900 fill-stone-900" />
              <span>محفوظ هنا ✓</span>
            </>
          ) : (
            <>
              <Bookmark className="w-5 h-5 text-amber-700" />
              <span>حفظ الصفحة</span>
            </>
          )}
        </button>

        {/* Book Title & Quick Jump Page Indicator */}
        <div className="text-center flex-1 mx-2">
          <h2 className="text-sm sm:text-lg font-black truncate max-w-[200px] sm:max-w-md mx-auto">
            {book.title}
          </h2>
          <button
            onClick={() => {
              setJumpPageInput(String(currentPage));
              setIsJumpModalOpen(true);
            }}
            className="text-xs sm:text-sm font-bold opacity-80 hover:opacity-100 underline decoration-dotted transition-opacity"
          >
            صفحة {currentPage} من {totalPages} (انتقال سريع)
          </button>
        </div>

        {/* Back to Library Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm sm:text-base font-bold bg-stone-200/80 hover:bg-stone-300 text-stone-800 transition-colors active:scale-95"
        >
          <span>المكتبة</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </header>

      {/* Main Reading Area - Smooth Pan & Pinch-Zoom Container */}
      <main className="flex-1 flex flex-col items-center justify-start p-2 sm:p-4 overflow-x-auto overflow-y-auto relative touch-pan-x touch-pan-y">
        {/* Loading Spinner */}
        {isRendering && (
          <div className="absolute inset-0 bg-stone-100/60 backdrop-blur-xs flex items-center justify-center z-20">
            <div className="bg-white/90 p-5 rounded-2xl shadow-xl flex flex-col items-center gap-3 border border-stone-200">
              <div className="w-9 h-9 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm sm:text-base font-bold text-stone-800">
                جاري تجهيز صفحة الكتاب...
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {renderError && (
          <div className="bg-red-50 text-red-800 p-5 rounded-2xl max-w-md text-center border-2 border-red-300 shadow-lg my-8">
            <p className="font-bold text-lg mb-2">عذراً، تعذر عرض الصفحة</p>
            <p className="text-sm opacity-90 mb-4">{renderError}</p>
            <button
              onClick={() => renderPage(mupdfDocRef.current, currentPage)}
              className="px-5 py-2 bg-red-600 text-white rounded-xl font-bold shadow hover:bg-red-700"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Hardware-Accelerated Canvas with Zero-Memory Smooth CSS Scaling */}
        <div
          className="flex justify-center transition-transform duration-100"
          style={{
            filter: theme.canvasFilter,
          }}
        >
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded-sm transition-[width] duration-150 ease-out"
            style={{
              backgroundColor: theme.paperBg,
              width: `${Math.floor(baseDisplayWidth * zoomLevel)}px`,
              height: 'auto',
              maxWidth: 'none',
            }}
          />
        </div>
      </main>

      {/* Floating Eye-Care & Zoom Side Toolbar */}
      <aside className="fixed right-3 bottom-24 sm:right-6 sm:bottom-28 flex flex-col gap-2.5 z-30">
        <button
          onClick={() => handleZoom(0.15)}
          title="تكبير الخط"
          className="w-12 h-12 sm:w-14 sm:h-14 bg-white/95 text-stone-800 rounded-full shadow-lg border border-stone-300 flex flex-col items-center justify-center hover:bg-amber-50 active:scale-90 transition-transform"
        >
          <ZoomIn className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="text-[10px] font-bold">تكبير</span>
        </button>

        <button
          onClick={() => handleZoom(-0.15)}
          title="تصغير الخط"
          className="w-12 h-12 sm:w-14 sm:h-14 bg-white/95 text-stone-800 rounded-full shadow-lg border border-stone-300 flex flex-col items-center justify-center hover:bg-amber-50 active:scale-90 transition-transform"
        >
          <ZoomOut className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="text-[10px] font-bold">تصغير</span>
        </button>

        <button
          onClick={handleResetZoom}
          title="إعادة ضبط الحجم"
          className="w-12 h-12 sm:w-14 sm:h-14 bg-white/95 text-stone-800 rounded-full shadow-lg border border-stone-300 flex flex-col items-center justify-center hover:bg-amber-50 active:scale-90 transition-transform"
        >
          <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="text-[10px] font-bold">ضبط</span>
        </button>

        <button
          onClick={() => setIsThemeModalOpen(true)}
          title="مظهر وإضاءة القراءة"
          className="w-12 h-12 sm:w-14 sm:h-14 bg-amber-700 text-white rounded-full shadow-xl flex flex-col items-center justify-center hover:bg-amber-800 active:scale-90 transition-transform border-2 border-amber-300"
        >
          <Palette className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="text-[10px] font-bold">المظهر</span>
        </button>
      </aside>

      {/* Giant Elderly-Friendly Navigation Bottom Bar */}
      <footer
        className="sticky bottom-0 z-40 px-3 py-3 sm:px-6 sm:py-4 shadow-2xl flex items-center justify-between gap-3 border-t"
        style={{
          backgroundColor: theme.headerBg,
          borderColor: 'rgba(0,0,0,0.1)',
        }}
      >
        {/* Previous Page Button */}
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className={`flex-1 py-3.5 sm:py-4 px-4 rounded-2xl font-black text-base sm:text-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 ${
            currentPage <= 1
              ? 'opacity-40 cursor-not-allowed bg-stone-300 text-stone-500'
              : 'bg-amber-200 hover:bg-amber-300 text-amber-950 border border-amber-400'
          }`}
        >
          <ChevronRight className="w-6 h-6 sm:w-7 sm:h-7" />
          <span>السابق</span>
        </button>

        {/* Page Counter Badge */}
        <div className="px-3 py-2 bg-stone-100/90 rounded-xl text-center min-w-[70px] sm:min-w-[90px] border border-stone-300">
          <span className="text-sm sm:text-base font-black text-stone-800">
            {currentPage} / {totalPages}
          </span>
        </div>

        {/* Next Page Button */}
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className={`flex-1 py-3.5 sm:py-4 px-4 rounded-2xl font-black text-base sm:text-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 ${
            currentPage >= totalPages
              ? 'opacity-40 cursor-not-allowed bg-stone-300 text-stone-500'
              : 'bg-amber-800 hover:bg-amber-900 text-amber-50 border border-amber-900'
          }`}
        >
          <span>التالي</span>
          <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>
      </footer>

      {/* Theme Selection Modal */}
      {isThemeModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-stone-50 rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-stone-200">
            <h3 className="text-lg sm:text-xl font-black text-stone-900 mb-4 text-center">
              اختر لون وإضاءة القراءة المريحة
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {Object.values(THEMES).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setThemeId(t.id);
                    setIsThemeModalOpen(false);
                  }}
                  className={`p-3 rounded-2xl flex flex-col items-center gap-1.5 border-2 transition-all ${
                    themeId === t.id
                      ? 'border-amber-600 ring-2 ring-amber-400 shadow-md scale-102'
                      : 'border-stone-200 hover:border-stone-400'
                  }`}
                  style={{ backgroundColor: t.bg, color: t.textColor }}
                >
                  <span className="font-bold text-sm sm:text-base">{t.name}</span>
                  <span className="text-[11px] opacity-75">{t.badge}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setIsThemeModalOpen(false)}
              className="w-full py-3 bg-stone-300 hover:bg-stone-400 text-stone-900 font-bold rounded-2xl text-center"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Jump to Page Modal */}
      {isJumpModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full shadow-2xl border border-stone-200 text-center">
            <h3 className="text-lg font-black text-stone-900 mb-2">انتقال لصفحة محددة</h3>
            <p className="text-xs text-stone-500 mb-4">
              أدخل رقم الصفحة من 1 إلى {totalPages}
            </p>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              className="w-full text-center text-2xl font-black p-3 border-2 border-amber-500 rounded-2xl mb-4 focus:outline-none focus:ring-4 focus:ring-amber-200"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const num = parseInt(jumpPageInput, 10);
                  if (!isNaN(num) && num >= 1 && num <= totalPages) {
                    handlePageChange(num);
                    setIsJumpModalOpen(false);
                  }
                }}
                className="flex-1 py-3 bg-amber-700 text-white font-black rounded-xl hover:bg-amber-800 shadow"
              >
                انتقال
              </button>
              <button
                onClick={() => setIsJumpModalOpen(false)}
                className="flex-1 py-3 bg-stone-200 text-stone-800 font-bold rounded-xl hover:bg-stone-300"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
