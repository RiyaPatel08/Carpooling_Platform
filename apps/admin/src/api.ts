/**
 * Thin API client. Holds the access token in memory + localStorage and
 * transparently refreshes once on a 401, so an expired token during a demo
 * re-authenticates instead of bouncing the admin to the login screen.
 */
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const STORAGE_KEY = 'syncroute.auth';

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string; orgId: string };
}

export function getAuth(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredAuth) : null;
}

export function setAuth(auth: StoredAuth | null) {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function raw(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getAuth();
  let res = await raw(path, init, auth?.accessToken);

  // One transparent refresh attempt, then give up and surface the 401.
  if (res.status === 401 && auth?.refreshToken) {
    const refreshed = await raw('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (refreshed.ok) {
      const next = (await refreshed.json()) as StoredAuth;
      setAuth(next);
      res = await raw(path, init, next.accessToken);
    } else {
      setAuth(null);
    }
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { message?: string; fields?: Record<string, string> } }).error;
    throw new ApiError(res.status, err?.message ?? 'Request failed', err?.fields);
  }
  return body as T;
}

export async function login(email: string, password: string): Promise<StoredAuth> {
  const res = await raw('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { message?: string; fields?: Record<string, string> } }).error;
    throw new ApiError(res.status, err?.message ?? 'Sign in failed', err?.fields);
  }
  const auth = body as StoredAuth;
  // The admin dashboard is for admins. An employee's token would be rejected
  // by every /admin route anyway; say so here rather than after five 403s.
  if (auth.user.role !== 'admin') {
    throw new ApiError(403, 'This dashboard is for company administrators only');
  }
  setAuth(auth);
  return auth;
}

export function logout() {
  setAuth(null);
}
