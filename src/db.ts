import { openDB, type DBSchema } from 'idb';

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  fileSize: number;
  pdfData?: ArrayBuffer;
  pdfUrl?: string;
  coverImage?: string;
  addedAt: number;
  lastReadPage: number;
  zoomLevel: number;
  theme: string;
  bookmarks: number[];
  isOnlineDefault?: boolean;
}

interface FamilyReaderDB extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
    indexes: { 'by-date': number };
  };
  progress: {
    key: string;
    value: {
      id: string;
      lastReadPage: number;
      zoomLevel: number;
      theme: string;
      bookmarks: number[];
    };
  };
}

const DB_NAME = 'family_reader_storage_v2';
const STORE_NAME = 'books';
const PROGRESS_STORE = 'progress';

export async function getDatabase() {
  return openDB<FamilyReaderDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-date', 'addedAt');
      }
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        db.createObjectStore(PROGRESS_STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function getAllBooks(): Promise<Omit<BookRecord, 'pdfData'>[]> {
  const db = await getDatabase();
  const all = await db.getAll(STORE_NAME);
  return all.map(({ pdfData, ...meta }) => meta).sort((a, b) => b.addedAt - a.addedAt);
}

export async function getBookWithData(id: string): Promise<BookRecord | undefined> {
  const db = await getDatabase();
  return db.get(STORE_NAME, id);
}

export async function saveBook(book: BookRecord): Promise<void> {
  const db = await getDatabase();
  await db.put(STORE_NAME, book);
}

export async function getSavedProgress(id: string) {
  const db = await getDatabase();
  return db.get(PROGRESS_STORE, id);
}

export async function saveBookmarkProgress(
  id: string,
  progress: { lastReadPage: number; zoomLevel?: number; theme?: string; bookmarks?: number[] }
): Promise<void> {
  const db = await getDatabase();
  // Update in progress store
  await db.put(PROGRESS_STORE, {
    id,
    lastReadPage: progress.lastReadPage,
    zoomLevel: progress.zoomLevel ?? 1.15,
    theme: progress.theme ?? 'sepia',
    bookmarks: progress.bookmarks ?? [],
  });

  // Also update in books store if present
  const existing = await db.get(STORE_NAME, id);
  if (existing) {
    existing.lastReadPage = progress.lastReadPage;
    if (progress.zoomLevel !== undefined) existing.zoomLevel = progress.zoomLevel;
    if (progress.theme !== undefined) existing.theme = progress.theme;
    if (progress.bookmarks !== undefined) existing.bookmarks = progress.bookmarks;
    await db.put(STORE_NAME, existing);
  }
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete(STORE_NAME, id);
  await db.delete(PROGRESS_STORE, id);
}
