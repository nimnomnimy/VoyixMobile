import { useState, useEffect, useRef, useCallback } from 'react';
import { bff } from '../lib/bffClient';
import { CatalogItem, LOCAL_IMAGES, baseItemCode } from '../data/catalog';

interface BspItemDetail {
  itemCode?: string | { value: string };
  shortDescription?: string | { values?: { value: string; locale?: string }[] };
  departmentId?: string;
  packageIdentifiers?: { value: string; packageIdentifierType?: string }[];
  imageUrls?: string[];
}

interface BspPriceEntry {
  itemCode?: string;
  price?: { amount?: number };
  unitPrice?: number;
}

function normaliseItemCode(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null && 'value' in raw) return (raw as any).value ?? '';
  return '';
}

function normaliseDescription(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as any;
    if (Array.isArray(obj.values) && obj.values.length > 0) return obj.values[0].value ?? '';
    if (typeof obj.value === 'string') return obj.value;
  }
  return '';
}

// Reverse map of CLR codes to colour names (mirrors catalog.ts)
const CLR_NAME: Record<string, string> = {
  BLK: 'Black', WHT: 'White', NVY: 'Navy', PNK: 'Pink', BLU: 'Blue',
};

function normaliseBspItem(item: BspItemDetail, priceMap: Record<string, number>): CatalogItem {
  const id = normaliseItemCode(item.itemCode);
  const name = normaliseDescription(item.shortDescription) || id;
  const barcode = item.packageIdentifiers?.[0]?.value;
  const image: string | number | undefined = item.imageUrls?.[0] ?? LOCAL_IMAGES[id] ?? LOCAL_IMAGES[baseItemCode(id)] ?? undefined;
  const category = item.departmentId ?? 'General';
  const price = priceMap[id] ?? 0;

  // Extract size/color from variant codes e.g. 'w001-S-BLK' → size='S', color='Black'
  let size: string | undefined;
  let color: string | undefined;
  const parts = id.split('-');
  if (parts.length >= 3) {
    size = parts[1];
    color = CLR_NAME[parts[2]] ?? parts[2];
  }

  return { id, name, price, image, barcode, category, size, color };
}

export function useCatalog(query: string, category: string) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ pageSize: '40' });
      if (query) params.set('q', query);

      const catalogResp = await bff.get<{
        itemDetails: BspItemDetail[];
        totalCount: number;
      }>(`/api/catalog/items?${params.toString()}`);

      let bspItems = catalogResp.itemDetails ?? [];

      if (category !== 'All') {
        bspItems = bspItems.filter(
          (i) => (i.departmentId ?? '').toLowerCase() === category.toLowerCase()
        );
      }

      const itemCodes = bspItems.map((i) => normaliseItemCode(i.itemCode)).filter(Boolean);
      let priceMap: Record<string, number> = {};
      if (itemCodes.length > 0) {
        try {
          const priceResp = await bff.post<{ itemPrices?: BspPriceEntry[] }>(
            '/api/catalog/prices',
            { itemCodes }
          );
          for (const entry of priceResp.itemPrices ?? []) {
            const code = entry.itemCode ?? '';
            const p = (entry as any).price;
            priceMap[code] = typeof p === 'number' ? p : (p?.amount ?? entry.unitPrice ?? 0);
          }
        } catch {
          // prices unavailable — items show $0
        }
      }

      setItems(bspItems.map((i) => normaliseBspItem(i, priceMap)));
    } catch {
      setItems([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query, category]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void fetchItems(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchItems]);

  return { items, loading, error, retry: fetchItems };
}
