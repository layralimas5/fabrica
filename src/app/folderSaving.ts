import { createStore, del, get, set, type UseStore } from 'idb-keyval';

/**
 * Saving straight into a folder of the computer (File System Access API, Chrome and Edge on desktop).
 * The user picks the base folder once; its handle stays in this browser and each carousel becomes a subfolder.
 */

interface PermissionCapableHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

type DirectoryPicker = (options: { id?: string; mode: 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;

const store: UseStore = createStore('fabrica-save-folder', 'kv');
const BASE_KEY = 'base-folder';
const PICKER_ID = 'fabrica-export';

export interface FolderFile {
  name: string;
  blob: Blob;
}

export function folderSavingSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Opens the system folder picker. Null when the user cancels. */
export async function pickBaseFolder(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  try {
    const handle = await picker({ id: PICKER_ID, mode: 'readwrite', startIn: 'documents' });
    await set(BASE_KEY, handle, store);
    return handle;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return null;
    throw cause;
  }
}

export async function savedBaseFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await get<FileSystemDirectoryHandle>(BASE_KEY, store)) ?? null;
  } catch {
    return null;
  }
}

export async function forgetBaseFolder(): Promise<void> {
  await del(BASE_KEY, store);
}

/** The browser asks again in each new session; must run inside a click. */
export async function ensureWriteAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const capable = handle as Partial<PermissionCapableHandle> & FileSystemDirectoryHandle;
  // Folders private to the browser (and older engines) have no permission prompt: they are always writable.
  if (!capable.queryPermission || !capable.requestPermission) return true;
  if ((await capable.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await capable.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** Windows and macOS reject some characters in folder names; trailing dots and spaces too. */
export function safeFolderName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80);
}

const SLIDE_FILE = /^\d{2}\.(jpg|png)$/;

/**
 * Writes the files into base/…path, creating the folders. Saving the same carousel again replaces its slides
 * and removes numbered slides left over from a longer earlier version.
 */
export async function saveToFolder(base: FileSystemDirectoryHandle, path: string[], files: FolderFile[]): Promise<void> {
  let folder = base;
  for (const part of path.map(safeFolderName).filter(Boolean)) folder = await folder.getDirectoryHandle(part, { create: true });

  const names = new Set(files.map((file) => file.name));
  for await (const name of (folder as unknown as { keys(): AsyncIterable<string> }).keys()) {
    if (SLIDE_FILE.test(name) && !names.has(name)) await folder.removeEntry(name);
  }
  for (const file of files) {
    const writable = await (await folder.getFileHandle(file.name, { create: true })).createWritable();
    await writable.write(file.blob);
    await writable.close();
  }
}
