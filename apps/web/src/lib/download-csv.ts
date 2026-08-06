import { auth } from './firebase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/**
 * Download an authenticated CSV export from the API.
 *
 * The export endpoints are guarded by FirebaseAuthGuard, so a bare `window.open`
 * fails: it sends no Authorization header (401) and is prone to double-prefixing
 * `/api/v1`. Instead we attach the Firebase ID token and stream the response to a
 * blob download.
 *
 * @param path API path AFTER the base, e.g. `/crm/customers/export/csv`
 *             (NEXT_PUBLIC_API_URL already includes the `/api/v1` prefix).
 * @param filename Suggested download filename.
 */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = await auth?.currentUser?.getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
