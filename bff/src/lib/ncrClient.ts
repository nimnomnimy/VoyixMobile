/**
 * NCR Voyix BSP HTTP client.
 *
 * All requests are signed with the AccessKey HMAC scheme:
 *   Authorization: AccessKey {sharedKey}:{base64(HmacSHA512(signableContent, secretKey + isoTimestamp))}
 *
 * Signable content = METHOD\n/path\ncontent-type\nnep-organization
 * (empty fields omitted, joined by newline)
 */
import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { logStart, logComplete } from './apiLog.js';

const { gateway, organization, sharedKey, secretKey, siteId } = config.bsp;

function buildSignableContent(method: string, url: string, contentType: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return [method.toUpperCase(), path, contentType, organization]
    .filter(Boolean)
    .join('\n');
}

function buildAccessKey(method: string, url: string, contentType: string, date: Date): string {
  const nonce = date.toISOString().slice(0, 19) + '.000Z';
  const key = secretKey + nonce;
  const signable = buildSignableContent(method, url, contentType);
  const signature = createHmac('sha512', key).update(signable).digest('base64');
  return `AccessKey ${sharedKey}:${signature}`;
}

export interface NcrRequestOptions {
  method?: string;
  body?: unknown;
  enterpriseUnit?: string | null;
  contentType?: string;
}

export interface NcrResponse<T = unknown> {
  status: number;
  data?: T;
}

export async function ncrRequest<T = unknown>(
  path: string,
  options: NcrRequestOptions = {}
): Promise<NcrResponse<T>> {
  const {
    method = 'GET',
    body = null,
    enterpriseUnit = null,
    contentType = 'application/json',
  } = options;

  const url = `${gateway}${path}`;
  const date = new Date();
  const authorization = buildAccessKey(method, url, body ? contentType : '', date);

  const headers: Record<string, string> = {
    Authorization: authorization,
    'nep-organization': organization,
    Date: date.toUTCString(),
    Accept: 'application/json',
  };

  if (body !== null) {
    headers['Content-Type'] = contentType;
  }
  if (enterpriseUnit) {
    headers['nep-enterprise-unit'] = enterpriseUnit;
  }

  const init: RequestInit = {
    method,
    headers,
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  };

  const logEntry = logStart(method, path);
  const t0 = Date.now();

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logComplete(logEntry, 0, Date.now() - t0, msg);
    throw err;
  }

  const status = res.status;

  if (status === 204 || method === 'DELETE') {
    logComplete(logEntry, status, Date.now() - t0);
    return { status };
  }

  try {
    const data = (await res.json()) as T;
    if (status >= 400) {
      // Suppress 404 noise for CDM consumer lookups — card-not-found is expected
      // for demo/test card numbers and handled gracefully by the loyalty route.
      const isCdmNotFound = status === 404 && path.startsWith('/cdm/');
      if (!isCdmNotFound) {
        console.error(`[NCR ${status}] ${method} ${path}`, JSON.stringify(data));
        logComplete(logEntry, status, Date.now() - t0, `HTTP ${status}`);
      } else {
        logComplete(logEntry, status, Date.now() - t0);
      }
    } else {
      logComplete(logEntry, status, Date.now() - t0);
    }
    return { status, data };
  } catch {
    logComplete(logEntry, status, Date.now() - t0);
    return { status };
  }
}

/** Convenience: use the configured default site as the enterprise unit. */
export function ncrSiteRequest<T = unknown>(
  path: string,
  options: Omit<NcrRequestOptions, 'enterpriseUnit'> = {}
): Promise<NcrResponse<T>> {
  return ncrRequest<T>(path, { ...options, enterpriseUnit: siteId });
}
