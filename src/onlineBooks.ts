import type { BookRecord } from './db';

const base = import.meta.env.BASE_URL || '/parents-library/';

export const DEFAULT_ONLINE_BOOKS: Omit<BookRecord, 'pdfData'>[] = [
  {
    id: 'alsirah-ibn-hisham',
    title: 'مختصر السيرة النبوية لابن هشام',
    author: 'أبو محمد عبد الملك بن هشام المعافري',
    totalPages: 257,
    fileSize: 6405786,
    coverImage: base + 'books/alsirah-cover.jpg',
    pdfUrl: base + 'books/alsirah.pdf',
    addedAt: 1700000000000,
    lastReadPage: 1,
    zoomLevel: 1.15,
    theme: 'sepia',
    bookmarks: [],
    isOnlineDefault: true,
  },
];
