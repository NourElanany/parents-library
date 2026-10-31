import React, { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  BookOpen,
  PlusCircle,
  ShieldCheck,
  UserCheck,
  UploadCloud,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  type BookRecord,
  getAllBooks,
  getBookWithData,
  saveBook,
  deleteBook,
} from './db';
import { Reader } from './Reader';

// Setup pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export default function App() {
  const [books, setBooks] = useState<Omit<BookRecord, 'pdfData'>[]>([]);
  const [activeBook, setActiveBook] = useState<BookRecord | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPdfBuffer, setSelectedPdfBuffer] = useState<{
    data: ArrayBuffer;
    fileName: string;
    totalPages: number;
    coverDataUrl: string;
  } | null>(null);

  // Load books library
  const refreshBooks = async () => {
    const list = await getAllBooks();
    setBooks(list);
  };

  useEffect(() => {
    refreshBooks();
  }, []);

  // Handle opening a book
  const handleOpenBook = async (id: string) => {
    const full = await getBookWithData(id);
    if (full) {
      setActiveBook(full);
    }
  };

  // Process chosen PDF file to extract first page as cover & page count
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert('يرجى اختيار ملف PDF صالح');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgressMsg('جاري قراءة ملف الكتاب وفحص صفحاته بدقة...');
      const arrayBuffer = await file.arrayBuffer();

      // Load with pdfjs to inspect & generate cover thumbnail
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer.slice(0)),
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
        cMapPacked: true,
      });

      const doc = await loadingTask.promise;
      const totalPages = doc.numPages;

      setUploadProgressMsg('جاري استخراج صورة الغلاف الأصلية...');
      const firstPage = await doc.getPage(1);
      const viewport = firstPage.getViewport({ scale: 0.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      let coverDataUrl = '';
      if (ctx) {
        await (firstPage.render({ canvasContext: ctx, viewport } as any)).promise;
        coverDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      }

      setSelectedPdfBuffer({
        data: arrayBuffer,
        fileName: file.name,
        totalPages,
        coverDataUrl,
      });

      // Default title from file name
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      setUploadAuthor('مكتبة العائلة');
      setIsUploading(false);
      setUploadProgressMsg('');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء فحص ملف الـ PDF. يرجى تجربة ملف آخر.');
      setIsUploading(false);
      setUploadProgressMsg('');
    }
  };

  const handleSaveUploadedBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPdfBuffer || !uploadTitle.trim()) return;

    const newBook: BookRecord = {
      id: `book_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: uploadTitle.trim(),
      author: uploadAuthor.trim() || 'كتاب نافع',
      totalPages: selectedPdfBuffer.totalPages,
      fileSize: selectedPdfBuffer.data.byteLength,
      pdfData: selectedPdfBuffer.data,
      coverImage: selectedPdfBuffer.coverDataUrl,
      addedAt: Date.now(),
      lastReadPage: 1,
      zoomLevel: 1.15,
      theme: 'sepia',
      bookmarks: [],
    };

    await saveBook(newBook);
    await refreshBooks();
    setIsAddModalOpen(false);
    setSelectedPdfBuffer(null);
    setUploadTitle('');
    setUploadAuthor('');
  };

  const handleDeleteBook = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    if (confirm(`هل أنت متأكد من حذف كتاب "${title}" من المكتبة؟`)) {
      await deleteBook(id);
      await refreshBooks();
    }
  };

  // If a book is opened, display the Accessible Reader
  if (activeBook) {
    return (
      <Reader
        book={activeBook}
        onBack={() => {
          setActiveBook(null);
          refreshBooks();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f5ecd8] text-stone-900 flex flex-col select-none">
      {/* 1. Header with Role Switch */}
      <header className="sticky top-0 z-20 bg-[#eae0c8] border-b border-amber-900/10 px-4 py-4 sm:px-8 shadow-sm flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen size={30} className="text-amber-900" />
            <h1 className="text-2xl sm:text-3xl font-black text-amber-950 tracking-tight">
              مكتبة الوالدين المباركة
            </h1>
          </div>
          <p className="text-sm sm:text-base font-bold text-amber-900/70 mt-0.5">
            {isAdminMode
              ? 'لوحة إدارة ورفع الكتب الجديدة للوالدين (أنت)'
              : 'اختر أي كتاب بالضغط عليه لمواصلة القراءة فوراً'}
          </p>
        </div>

        {/* Admin Switch Button */}
        <button
          onClick={() => setIsAdminMode(!isAdminMode)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-sm sm:text-base transition-all cursor-pointer shadow-sm active:scale-95 ${
            isAdminMode
              ? 'bg-amber-900 text-amber-100 ring-2 ring-amber-700'
              : 'bg-amber-100 text-amber-950 border border-amber-300'
          }`}
        >
          {isAdminMode ? <ShieldCheck size={22} /> : <UserCheck size={22} />}
          <span>{isAdminMode ? 'وضع الإشراف' : 'وضع الوالدين'}</span>
        </button>
      </header>

      {/* 2. Admin Action Bar */}
      {isAdminMode && (
        <div className="bg-amber-500/15 border-b border-amber-600/20 px-4 py-3 sm:px-8 flex items-center justify-between animate-in fade-in">
          <div className="font-extrabold text-amber-950 text-base">
            لديك <span className="underline">{books.length}</span> كتب جاهزة ومتاحة للوالدين
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-amber-800 hover:bg-amber-900 text-amber-50 font-black px-5 py-3 rounded-2xl text-base shadow-md cursor-pointer active:scale-95 transition-all"
          >
            <PlusCircle size={22} />
            <span>رفع كتاب PDF جديد</span>
          </button>
        </div>
      )}

      {/* 3. Main Bookshelf (Visual Large Cards for Elderly) */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8">
        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-24 h-24 rounded-3xl bg-amber-200/60 flex items-center justify-center text-amber-900 mb-4 shadow-inner">
              <UploadCloud size={48} />
            </div>
            <h2 className="text-2xl font-black text-amber-950 mb-2">المكتبة فارغة حالياً</h2>
            <p className="text-base font-bold text-amber-900/70 max-w-md mb-6 leading-relaxed">
              قم بالضغط على الزر أدناه لرفع أول كتاب PDF للوالدين، وسيتم حفظه بشكل دائم وسريع.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-amber-800 text-amber-50 font-black text-lg px-8 py-4 rounded-2xl shadow-lg active:scale-95 cursor-pointer flex items-center gap-3"
            >
              <PlusCircle size={26} />
              <span>رفع أول كتاب الآن</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
            {books.map((b) => {
              const hasStarted = (b.lastReadPage || 1) > 1;
              return (
                <div
                  key={b.id}
                  onClick={() => handleOpenBook(b.id)}
                  className="group bg-[#fcf8ec] rounded-3xl p-4 sm:p-5 border-2 border-amber-900/10 shadow-md hover:shadow-xl transition-all cursor-pointer flex gap-4 sm:gap-5 items-stretch active:scale-[0.99] relative overflow-hidden"
                >
                  {/* Book Cover Thumbnail */}
                  <div className="w-28 sm:w-32 shrink-0 rounded-2xl overflow-hidden bg-amber-200/50 shadow-inner flex items-center justify-center border border-amber-900/10">
                    {b.coverImage ? (
                      <img
                        src={b.coverImage}
                        alt={b.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <BookOpen size={40} className="text-amber-800/40" />
                    )}
                  </div>

                  {/* Book Metadata & Instant Resume Badge */}
                  <div className="flex-1 flex flex-col justify-between py-1">
                    <div>
                      <h2 className="font-black text-xl sm:text-2xl text-amber-950 leading-snug line-clamp-2">
                        {b.title}
                      </h2>
                      <p className="text-sm sm:text-base font-bold text-amber-900/70 mt-1">
                        {b.author}
                      </p>
                      <p className="text-xs font-extrabold text-amber-900/50 mt-1">
                        {b.totalPages} صفحة
                      </p>
                    </div>

                    {/* Prominent Resume Indicator */}
                    <div className="mt-3">
                      <div
                        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-black text-sm ${
                          hasStarted
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-amber-200/80 text-amber-950'
                        }`}
                      >
                        <Sparkles size={16} />
                        <span>
                          {hasStarted
                            ? `متابعة من صفحة ${b.lastReadPage}`
                            : 'ابدأ القراءة من البداية'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Admin Delete Button */}
                  {isAdminMode && (
                    <button
                      onClick={(e) => handleDeleteBook(e, b.id, b.title)}
                      className="absolute top-3 left-3 p-2.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 cursor-pointer transition-colors"
                      title="حذف هذا الكتاب"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 4. Upload Book Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#fcf8ec] text-amber-950 w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-amber-900/20 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-center mb-5">
              رفع كتاب PDF جديد للمكتبة
            </h2>

            {isUploading ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 border-4 border-amber-800 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 font-black text-lg text-amber-900">{uploadProgressMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSaveUploadedBook} className="space-y-4">
                {/* PDF File Picker Box */}
                <div>
                  <label className="block text-sm font-black mb-1.5 text-amber-900">
                    اختر ملف الـ PDF من جهازك:
                  </label>
                  <label className="border-3 border-dashed border-amber-400 hover:border-amber-600 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-amber-50 hover:bg-amber-100/60 transition-all text-center">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <UploadCloud size={42} className="text-amber-800 mb-2" />
                    <span className="font-black text-base text-amber-950">
                      {selectedPdfBuffer
                        ? `تم اختيار: ${selectedPdfBuffer.fileName} (${selectedPdfBuffer.totalPages} صفحة)`
                        : 'اضغط هنا لاختيار ملف الـ PDF'}
                    </span>
                    <span className="text-xs font-bold text-amber-800/60 mt-1">
                      يدعم الكتب الكبيرة 1000 و 1500 صفحة بسلاسة تامة
                    </span>
                  </label>
                </div>

                {selectedPdfBuffer && (
                  <>
                    <div>
                      <label className="block text-sm font-black mb-1 text-amber-900">
                        عنوان الكتاب الذي سيظهر للوالدين:
                      </label>
                      <input
                        type="text"
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        required
                        className="w-full p-3.5 rounded-xl border-2 border-amber-300 bg-white font-bold text-base text-amber-950 focus:outline-none focus:border-amber-700"
                        placeholder="مثال: تفسير السعدي الميسر"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-black mb-1 text-amber-900">
                        اسم المؤلف أو الشيخ:
                      </label>
                      <input
                        type="text"
                        value={uploadAuthor}
                        onChange={(e) => setUploadAuthor(e.target.value)}
                        className="w-full p-3.5 rounded-xl border-2 border-amber-300 bg-white font-bold text-base text-amber-950 focus:outline-none focus:border-amber-700"
                        placeholder="مثال: الإمام النووي"
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={!selectedPdfBuffer}
                    className="flex-1 py-3.5 rounded-2xl font-black text-lg bg-amber-800 text-amber-50 disabled:opacity-40 cursor-pointer active:scale-95 transition-all shadow-md"
                  >
                    نشر في مكتبة الوالدين
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setSelectedPdfBuffer(null);
                    }}
                    className="flex-1 py-3.5 rounded-2xl font-black text-lg bg-stone-300 text-stone-900 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
