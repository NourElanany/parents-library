import React, { useState, useEffect } from 'react';
import mupdf from './mupdfEngine';
import {
  BookOpen,
  PlusCircle,
  ShieldCheck,
  UserCheck,
  UploadCloud,
  Trash2,
  Sparkles,
  Lock,
  KeyRound,
  Globe,
  Settings,
} from 'lucide-react';
import {
  type BookRecord,
  getAllBooks,
  getBookWithData,
  saveBook,
  deleteBook,
  getSavedProgress,
} from './db';
import { DEFAULT_ONLINE_BOOKS } from './onlineBooks';
import { Reader } from './Reader';

export default function App() {
  const [books, setBooks] = useState<Omit<BookRecord, 'pdfData'>[]>([]);
  const [activeBook, setActiveBook] = useState<BookRecord | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [newPinInput, setNewPinInput] = useState('');

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

  // Load books library (combining built-in online library with local uploaded books)
  const refreshBooks = async () => {
    const localBooks = await getAllBooks();
    
    // Attach latest saved bookmark progress to each book
    const enrichedOnline = await Promise.all(
      DEFAULT_ONLINE_BOOKS.map(async (b) => {
        const prog = await getSavedProgress(b.id);
        return {
          ...b,
          lastReadPage: prog?.lastReadPage || b.lastReadPage || 1,
        };
      })
    );

    const enrichedLocal = await Promise.all(
      localBooks.map(async (b) => {
        const prog = await getSavedProgress(b.id);
        return {
          ...b,
          lastReadPage: prog?.lastReadPage || b.lastReadPage || 1,
        };
      })
    );

    // Filter out duplicates if an online book was also saved locally
    const onlineIds = new Set(enrichedOnline.map((o) => o.id));
    const customOnly = enrichedLocal.filter((l) => !onlineIds.has(l.id));

    setBooks([...enrichedOnline, ...customOnly]);
  };

  useEffect(() => {
    refreshBooks();
  }, []);

  // Handle opening a book
  const handleOpenBook = async (bookMeta: Omit<BookRecord, 'pdfData'>) => {
    if (bookMeta.isOnlineDefault) {
      // Online book
      setActiveBook(bookMeta as BookRecord);
      return;
    }

    const full = await getBookWithData(bookMeta.id);
    if (full) {
      setActiveBook(full);
    }
  };

  // Supervisor Password Verification
  const getStoredPassword = () => {
    return localStorage.getItem('family_reader_admin_pin') || '1234';
  };

  const handleAdminToggle = () => {
    if (isAdminMode) {
      // Exit admin mode immediately to Reading/Parents Mode
      setIsAdminMode(false);
    } else {
      // Require Password
      setPasswordInput('');
      setPasswordError('');
      setIsPasswordModalOpen(true);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === getStoredPassword()) {
      setIsAdminMode(true);
      setIsPasswordModalOpen(false);
      setPasswordError('');
    } else {
      setPasswordError('كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.');
    }
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPinInput.trim()) return;
    localStorage.setItem('family_reader_admin_pin', newPinInput.trim());
    setIsChangePinModalOpen(false);
    alert('تم تغيير كلمة مرور وضع الإشراف بنجاح!');
  };

  // Process chosen PDF file using MuPDF WebAssembly
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert('يرجى اختيار ملف PDF صالح');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgressMsg('جاري قراءة ملف الكتاب وفحص صفحاته بمحرك MuPDF...');
      const arrayBuffer = await file.arrayBuffer();

      // Open in MuPDF
      const doc = mupdf.Document.openDocument(arrayBuffer, 'application/pdf');
      const totalPages = doc.countPages();

      setUploadProgressMsg('جاري استخراج صورة الغلاف بدقة عالية...');
      const firstPage = doc.loadPage(0);
      const pixmap = firstPage.toPixmap(mupdf.Matrix.scale(0.5, 0.5), mupdf.ColorSpace.DeviceRGB, false);
      const pngBytes = pixmap.asPNG();
      const blob = new Blob([pngBytes as any], { type: 'image/png' });

      const reader = new FileReader();
      reader.onloadend = () => {
        const coverDataUrl = (reader.result as string) || '';
        setSelectedPdfBuffer({
          data: arrayBuffer,
          fileName: file.name,
          totalPages,
          coverDataUrl,
        });
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
        setUploadAuthor('مكتبة العائلة');
        setIsUploading(false);
        setUploadProgressMsg('');
      };
      reader.readAsDataURL(blob);
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
    if (!isAdminMode) return;

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
      {/* 1. Header with Role Switch & Password Lock */}
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
              ? 'لوحة إدارة ورفع الكتب الجديدة (وضع الإشراف محمي برمز مرور)'
              : 'مكتبة القراءة السهلة - اضغط على أي كتاب لبدء القراءة مباشرة'}
          </p>
        </div>

        {/* Admin Switch Button */}
        <div className="flex items-center gap-2">
          {isAdminMode && (
            <button
              onClick={() => {
                setNewPinInput('');
                setIsChangePinModalOpen(true);
              }}
              title="تغيير كلمة المرور"
              className="p-2.5 rounded-2xl bg-amber-200/80 hover:bg-amber-300 text-amber-950 border border-amber-400 cursor-pointer transition-colors shadow-sm active:scale-95"
            >
              <Settings size={20} />
            </button>
          )}

          <button
            onClick={handleAdminToggle}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-sm sm:text-base transition-all cursor-pointer shadow-sm active:scale-95 ${
              isAdminMode
                ? 'bg-amber-900 text-amber-100 ring-2 ring-amber-700'
                : 'bg-amber-100 text-amber-950 border border-amber-300'
            }`}
          >
            {isAdminMode ? <ShieldCheck size={22} /> : <UserCheck size={22} />}
            <span>{isAdminMode ? 'خروج من الإشراف' : 'وضع الإشراف'}</span>
          </button>
        </div>
      </header>

      {/* 2. Admin Action Bar (Only visible in Supervisor Mode) */}
      {isAdminMode && (
        <div className="bg-amber-500/15 border-b border-amber-600/20 px-4 py-3 sm:px-8 flex items-center justify-between animate-in fade-in">
          <div className="font-extrabold text-amber-950 text-sm sm:text-base">
            وضع الإشراف نشط: يمكنك رفع كتب جديدة أو حذف الكتب المرفوعة.
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-amber-800 hover:bg-amber-900 text-amber-50 font-black px-5 py-2.5 sm:py-3 rounded-2xl text-sm sm:text-base shadow-md cursor-pointer active:scale-95 transition-all"
          >
            <PlusCircle size={22} />
            <span>رفع كتاب PDF جديد</span>
          </button>
        </div>
      )}

      {/* 3. Main Bookshelf (Visual Large Cards for Elderly) */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {books.map((b) => {
            const hasSavedProgress = (b.lastReadPage || 1) > 1;
            return (
              <div
                key={b.id}
                onClick={() => handleOpenBook(b)}
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

                {/* Book Metadata & Badges */}
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {b.isOnlineDefault ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                          <Globe size={12} />
                          <span>كتاب أونلاين مثبت</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                          <span>كتاب محفوظ محلياً</span>
                        </span>
                      )}
                    </div>
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

                  {/* Bookmark Status Indicator */}
                  <div className="mt-3">
                    <div
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-black text-xs sm:text-sm ${
                        hasSavedProgress
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-amber-200/80 text-amber-950'
                      }`}
                    >
                      <Sparkles size={16} />
                      <span>
                        {hasSavedProgress
                          ? `علامة محفوظة عند صفحة ${b.lastReadPage}`
                          : 'ابدأ القراءة من البداية'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Delete Button - ONLY VISIBLE IN SUPERVISOR MODE (Requirement from user) */}
                {isAdminMode && !b.isOnlineDefault && (
                  <button
                    onClick={(e) => handleDeleteBook(e, b.id, b.title)}
                    className="absolute top-3 left-3 p-2.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 cursor-pointer transition-colors shadow-sm active:scale-90 z-10"
                    title="حذف هذا الكتاب من المكتبة"
                    aria-label="حذف"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* 4. Password / PIN Modal for Supervisor Mode (Requirement from user) */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#fcf8ec] text-amber-950 w-full max-w-sm rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-amber-900/20 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-200 mx-auto flex items-center justify-center text-amber-900 mb-3 shadow-inner">
              <Lock size={32} />
            </div>
            <h2 className="text-xl font-black mb-1">الدخول لوضع الإشراف</h2>
            <p className="text-xs font-bold text-amber-900/70 mb-4">
              أدخل كلمة المرور لإدارة ورفع أو حذف الكتب
            </p>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="كلمة المرور (الافتراضية: 1234)"
                  autoFocus
                  className="w-full text-center text-xl font-black p-3.5 rounded-2xl border-2 border-amber-400 bg-white focus:outline-none focus:ring-4 focus:ring-amber-200"
                />
                {passwordError && (
                  <p className="text-xs font-bold text-red-600 mt-2">{passwordError}</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3.5 bg-amber-900 text-amber-50 font-black rounded-xl hover:bg-amber-950 shadow active:scale-95 transition-transform"
                >
                  دخول
                </button>
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="flex-1 py-3.5 bg-stone-300 text-stone-800 font-bold rounded-xl hover:bg-stone-400"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Change Password Modal */}
      {isChangePinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#fcf8ec] text-amber-950 w-full max-w-sm rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-amber-900/20 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-200 mx-auto flex items-center justify-center text-amber-900 mb-3 shadow-inner">
              <KeyRound size={32} />
            </div>
            <h2 className="text-xl font-black mb-1">تغيير رمز مرور الإشراف</h2>
            <p className="text-xs font-bold text-amber-900/70 mb-4">
              أدخل رمز المرور الجديد لحفظه
            </p>

            <form onSubmit={handleChangePinSubmit} className="space-y-4">
              <input
                type="text"
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                placeholder="الرمز الجديد (مثال: 5678)"
                required
                autoFocus
                className="w-full text-center text-xl font-black p-3.5 rounded-2xl border-2 border-amber-400 bg-white focus:outline-none focus:ring-4 focus:ring-amber-200"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-3.5 bg-amber-900 text-amber-50 font-black rounded-xl hover:bg-amber-950 shadow"
                >
                  حفظ الرمز
                </button>
                <button
                  type="button"
                  onClick={() => setIsChangePinModalOpen(false)}
                  className="flex-1 py-3.5 bg-stone-300 text-stone-800 font-bold rounded-xl hover:bg-stone-400"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Upload Book Modal */}
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
                      يدعم الكتب الكبيرة 1000 و 1500 صفحة بمحرك MuPDF
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
                        placeholder="مثال: مختصر السيرة النبوية"
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
                        placeholder="مثال: ابن هشام"
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
