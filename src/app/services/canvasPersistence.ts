import type { Connection, Node, NodeGroup } from '../store/canvasStore';

export const CANVAS_DB_NAME = 'ideascape-canvas';
export const CANVAS_DB_VERSION = 1;
export const CANVAS_STORE_NAME = 'documents';
export const DEFAULT_CANVAS_DOCUMENT_ID = 'default';
export const LEGACY_AUTOSAVE_KEY = 'mindmap-autosave';

export interface CanvasSnapshot {
  schemaVersion: 1;
  documentId: string;
  canvasName: string;
  nodes: Node[];
  connections: Connection[];
  groups: NodeGroup[];
  transform: { x: number; y: number; scale: number };
  settings?: unknown;
  timestamp: number;
  truncated?: boolean;
}

export function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function openCanvasDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CANVAS_DB_NAME, CANVAS_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CANVAS_STORE_NAME)) {
        db.createObjectStore(CANVAS_STORE_NAME, { keyPath: 'documentId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runStoreRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openCanvasDb().then((db) => (
    new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(CANVAS_STORE_NAME, mode);
      const store = transaction.objectStore(CANVAS_STORE_NAME);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    })
  ));
}

export function normalizeCanvasSnapshot(data: Partial<CanvasSnapshot> & Record<string, unknown>): CanvasSnapshot {
  return {
    schemaVersion: 1,
    documentId: typeof data.documentId === 'string' ? data.documentId : DEFAULT_CANVAS_DOCUMENT_ID,
    canvasName: typeof data.canvasName === 'string' ? data.canvasName : 'Untitled Canvas',
    nodes: Array.isArray(data.nodes) ? data.nodes as Node[] : [],
    connections: Array.isArray(data.connections) ? data.connections as Connection[] : [],
    groups: Array.isArray(data.groups) ? data.groups as NodeGroup[] : [],
    transform: data.transform && typeof data.transform === 'object'
      ? data.transform as CanvasSnapshot['transform']
      : { x: 0, y: 0, scale: 1 },
    settings: data.settings,
    timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
    truncated: data.truncated === true,
  };
}

export async function saveCanvasSnapshot(snapshot: CanvasSnapshot): Promise<void> {
  if (!canUseIndexedDb()) {
    localStorage.setItem(LEGACY_AUTOSAVE_KEY, JSON.stringify(snapshot));
    return;
  }

  await runStoreRequest('readwrite', (store) => store.put(snapshot));
}

export async function loadCanvasSnapshot(
  documentId = DEFAULT_CANVAS_DOCUMENT_ID,
): Promise<CanvasSnapshot | null> {
  if (canUseIndexedDb()) {
    const snapshot = await runStoreRequest<CanvasSnapshot | undefined>(
      'readonly',
      (store) => store.get(documentId),
    );
    if (snapshot) return normalizeCanvasSnapshot(snapshot);
  }

  const raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
  if (!raw) return null;

  return normalizeCanvasSnapshot(JSON.parse(raw));
}
