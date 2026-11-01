import type { BookRecord } from './db';
import booksData from './booksData.json';

const base = import.meta.env.BASE_URL || '/parents-library/';

export const DEFAULT_ONLINE_BOOKS: Omit<BookRecord, 'pdfData'>[] = booksData.map((b, idx) => ({
  id: b.id,
  title: b.title,
  author: b.author,
  totalPages: b.totalPages,
  fileSize: b.fileSize,
  coverImage: base + 'books/' + b.coverFilename,
  pdfUrl: base + 'books/' + b.filename,
  addedAt: 1700000000000 + idx,
  lastReadPage: 1,
  zoomLevel: 1.15,
  theme: 'sepia',
  bookmarks: [],
  isOnlineDefault: true,
}));
