/**
 * In-memory NCR Voyix BSP API call log.
 * Each entry records which BSP service was called, the HTTP details, and outcome.
 */

export interface ApiLogEntry {
  id: number;
  timestamp: string;         // ISO8601
  service: string;           // e.g. "Catalog", "Order Management", "TDM"
  method: string;
  path: string;
  statusCode: number | null; // null while in-flight
  durationMs: number | null;
  ok: boolean;
  error?: string;
}

// Service name derived from the URL path
function deriveService(path: string): string {
  if (path.startsWith('/catalog/')) return 'Catalog';
  if (path.startsWith('/order/')) return 'Order Management';
  if (path.startsWith('/transaction/')) return 'TDM (Transaction Data Manager)';
  if (path.startsWith('/site/')) return 'Sites';
  if (path.startsWith('/security/')) return 'Security / IAM';
  if (path.startsWith('/price/')) return 'Price Engine';
  if (path.startsWith('/promotion/')) return 'Promotions Engine';
  if (path.startsWith('/loyalty/')) return 'Loyalty';
  if (path.startsWith('/customer/')) return 'Customer Management';
  if (path.startsWith('/inventory/')) return 'Inventory';
  return 'BSP API';
}

const MAX_ENTRIES = 200;
const entries: ApiLogEntry[] = [];
let seq = 0;

export function logStart(method: string, path: string): ApiLogEntry {
  const entry: ApiLogEntry = {
    id: ++seq,
    timestamp: new Date().toISOString(),
    service: deriveService(path),
    method: method.toUpperCase(),
    path,
    statusCode: null,
    durationMs: null,
    ok: false,
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.pop();
  return entry;
}

export function logComplete(entry: ApiLogEntry, statusCode: number, durationMs: number, error?: string) {
  entry.statusCode = statusCode;
  entry.durationMs = durationMs;
  entry.ok = statusCode < 400;
  if (error) entry.error = error;
}

export function getLog(): ApiLogEntry[] {
  return entries;
}

export function clearLog() {
  entries.length = 0;
}
