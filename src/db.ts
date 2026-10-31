import { openDB, type DBSchema } from 'idb';

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  fileSize: number;
  pdfData: ArrayBuffer; // Direct binary in IndexedDB - handles 50MB+ without memory leak
  coverImage?: string;
  addedAt: number;
  lastReadPage: number;
  zoomLevel: number;
  theme: string;
  bookmarks: number[];
}

interface FamilyReaderDB extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
    indexes: { 'by-date': number };
  };
}

const DB_NAME = 'family_reader_storage_v1';
const STORE_NAME = 'books';

export async function getDatabase() {
  return openDB<FamilyReaderDB>(DB_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('by-date', 'addedAt');
    },
  });
}

export async function getAllBooks(): Promise<Omit<BookRecord, 'pdfData'>[]> {
  const db = await getDatabase();
  const all = await db.getAll(STORE_NAME);
  // Return lightweight metadata for library view (without loading huge ArrayBuffers in RAM)
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

export async function updateReadingProgress(
  id: string,
  progress: { lastReadPage?: number; zoomLevel?: number; theme?: string; bookmarks?: number[] }
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.get(STORE_NAME, id);
  if (!existing) return;
  const updated: BookRecord = {
    ...existing,
    lastReadPage: progress.lastReadPage ?? existing.lastReadPage,
    zoomLevel: progress.zoomLevel ?? existing.zoomLevel,
    theme: progress.theme ?? existing.theme,
    bookmarks: progress.bookmarks ?? existing.bookmarks,
  };
  await db.put(STORE_NAME, updated);
}

export async function deleteBook(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete(STORE_NAME, id);
}
