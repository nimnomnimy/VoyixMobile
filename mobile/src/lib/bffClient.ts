/**
 * Shared BFF HTTP client.
 * Automatically attaches the auth JWT to every request.
 */
import * as SecureStore from 'expo-secure-store';

const BFF = process.env.EXPO_PUBLIC_BFF_URL || 'http://localhost:8765';

export class BffError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'BffError';
  }
}

async function baseHeaders(hasBody: boolean, extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync('authToken');
  return {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export async function bffFetch<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const { method = 'GET', body, signal } = options;
  const headers = await baseHeaders(body !== undefined);

  const res = await fetch(`${BFF}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

  if (!res.ok) {
    throw new BffError(res.status, json?.error ?? `BFF error ${res.status}`);
  }

  return json as T;
}

export const bff = {
  get:    <T>(path: string, signal?: AbortSignal) =>
    bffFetch<T>(path, { method: 'GET', signal }),
  post:   <T>(path: string, body: unknown, signal?: AbortSignal) =>
    bffFetch<T>(path, { method: 'POST', body, signal }),
  patch:  <T>(path: string, body: unknown) =>
    bffFetch<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) =>
    bffFetch<T>(path, { method: 'DELETE' }),
};
