/** Injection token for the configured object store (null when document storage is off). */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StoredObject {
  /** Backend-specific id needed to delete this exact object later. */
  fileId: string;
}

/**
 * Private blob storage. Callers pass already-encrypted bytes; the store's
 * location and credentials never leave the server (files are only reachable
 * through the API, which authorizes every read).
 */
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string, fileId: string): Promise<void>;
}
