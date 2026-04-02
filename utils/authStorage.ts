/**
 * Resolved auth JSON path per PE_USERNAME so switching users gets a separate cache.
 * Paths are posix-style so Playwright resolves them consistently on Windows.
 */
export function getAuthStoragePath(): string {
  const user = process.env.PE_USERNAME?.trim() || 'default';
  const safe = user.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `playwright/.auth/${safe}.json`;
}

/** Tracks which username last wrote the storage file (for global setup refresh). */
export function getAuthMetaPath(): string {
  return 'playwright/.auth/.current-user';
}
