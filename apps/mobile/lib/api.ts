import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * On a physical device "localhost" is the phone itself, so the API host must
 * be the dev machine's LAN IP. Set EXPO_PUBLIC_API_URL in .env to override.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

const KEY = 'syncroute.auth';

export interface AuthUser {
  id: string;
  orgId: string;
  role: 'admin' | 'employee';
  name: string;
  email: string;
  phone: string;
  photoUrl: string | null;
}

export interface StoredAuth {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

let cached: StoredAuth | null = null;

export async function loadAuth(): Promise<StoredAuth | null> {
  if (cached) return cached;
  const raw = await AsyncStorage.getItem(KEY);
  cached = raw ? (JSON.parse(raw) as StoredAuth) : null;
  return cached;
}

export async function saveAuth(auth: StoredAuth | null): Promise<void> {
  cached = auth;
  if (auth) await AsyncStorage.setItem(KEY, JSON.stringify(auth));
  else await AsyncStorage.removeItem(KEY);
}

export function currentToken(): string | null {
  return cached?.accessToken ?? null;
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

async function request(path: string, init: RequestInit, token?: string) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/**
 * Every call goes through here. On a 401 it refreshes once and retries — a
 * commuter opening the app after a night's sleep should not be logged out.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = await loadAuth();
  let res = await request(path, init, auth?.accessToken);

  if (res.status === 401 && auth?.refreshToken) {
    const refreshed = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (refreshed.ok) {
      const next = (await refreshed.json()) as StoredAuth;
      await saveAuth(next);
      res = await request(path, init, next.accessToken);
    } else {
      await saveAuth(null);
    }
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { message?: string; fields?: Record<string, string> } }).error;
    throw new ApiError(res.status, err?.message ?? 'Something went wrong', err?.fields);
  }
  return body as T;
}

export async function loginRequest(email: string, password: string): Promise<StoredAuth> {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { message?: string; fields?: Record<string, string> } }).error;
    throw new ApiError(res.status, err?.message ?? 'Sign in failed', err?.fields);
  }
  const auth = body as StoredAuth;
  await saveAuth(auth);
  return auth;
}

export async function registerRequest(payload: Record<string, unknown>): Promise<StoredAuth> {
  const res = await request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { message?: string; fields?: Record<string, string> } }).error;
    throw new ApiError(res.status, err?.message ?? 'Could not create account', err?.fields);
  }
  const auth = body as StoredAuth;
  await saveAuth(auth);
  return auth;
}
