import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { secureStore } from './secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** RFC1918 + loopback. Release APKs must not silently talk to a laptop. */
function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return true;
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (![a, b, Number(parts[2]), Number(parts[3])].every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return false;
  }
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

if (!__DEV__) {
  let hostname = '';
  try {
    hostname = new URL(BASE_URL).hostname;
  } catch {
    throw new Error(
      'This release build has an invalid EXPO_PUBLIC_API_URL and cannot start. Rebuild with the public API URL on the EAS preview/production profile.',
    );
  }
  if (isPrivateOrLocalHost(hostname)) {
    throw new Error(
      `This release build is pointed at a local API (${hostname}) and cannot start. Rebuild with EXPO_PUBLIC_API_URL set on the EAS preview/production profile, not a LAN address from .env.`,
    );
  }
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  // Handle 204 No Content (empty body) without throwing a JSON parse error
  transformResponse: [
    (data: string) => {
      if (!data || data.trim() === '') return null;
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    },
  ],
});

// Track if we're currently refreshing to prevent loops
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
}

// Request interceptor — attach Firebase ID token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await secureStore.getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const deviceToken = await secureStore.getOrCreateDeviceToken();
    if (deviceToken) {
      config.headers['X-Device-Token'] = deviceToken;
    }
    const method = (config.method ?? 'get').toLowerCase();
    const url = config.url ?? '';
    if (
      method === 'post' &&
      !config.headers['Idempotency-Key'] &&
      (url.includes('/ai/') || /\/cover-letters\/[^/]+\/ai\/generate/.test(url))
    ) {
      const key =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      config.headers['Idempotency-Key'] = key;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — handle 401, token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Firebase handles token refresh internally — get fresh token
        const { getFirebaseAuth } = await import('./firebase');
        const auth = getFirebaseAuth();
        const currentUser = auth.currentUser;

        if (currentUser) {
          const freshToken = await currentUser.getIdToken(true);
          await secureStore.setAuthToken(freshToken);
          processQueue(null, freshToken);
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return apiClient(originalRequest);
        } else {
          processQueue(new Error('No user'), null);
          // Trigger logout
          const { useAuthStore } = await import('../store/auth-store');
          useAuthStore.getState().logout();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        const { useAuthStore } = await import('../store/auth-store');
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Nest TransformInterceptor wraps successes as `{ success, data, timestamp }`.
 * Same rule as web (`apps/web/src/lib/api.ts`): peel `data` when present, else
 * return the body (204/empty → `null`; already-unwrapped payloads stay put).
 * Do not put this on the axios interceptor — 401 retry needs the full response.
 */
function unwrapEnvelope<T>(body: unknown): T {
  if (
    body !== null &&
    typeof body === 'object' &&
    'data' in body &&
    (body as { data: unknown }).data !== undefined
  ) {
    return (body as { data: T }).data;
  }
  return body as T;
}

// Typed API methods
export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    apiClient.get(url, { params }).then((r) => unwrapEnvelope<T>(r.data)),

  post: <T>(url: string, data?: unknown) =>
    apiClient.post(url, data).then((r) => unwrapEnvelope<T>(r.data)),

  put: <T>(url: string, data?: unknown) =>
    apiClient.put(url, data).then((r) => unwrapEnvelope<T>(r.data)),

  patch: <T>(url: string, data?: unknown) =>
    apiClient.patch(url, data).then((r) => unwrapEnvelope<T>(r.data)),

  delete: <T>(url: string) =>
    apiClient.delete(url).then((r) => unwrapEnvelope<T>(r.data)),

  postForm: <T>(url: string, formData: FormData) =>
    apiClient
      .post(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => unwrapEnvelope<T>(r.data)),
};
