/**
 * useCatalog — fetches live catalog items from the BFF (NCR Voyix Catalog API).
 * Falls back to the hardcoded local catalog if BFF is unreachable or returns no results.
 */
import { useState, useEffect, useRef } from 'react';
import { bff, BffError } from '../lib/bffClient';
import { CatalogItem, CATALOG } from '../data/catalog';

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

function normaliseBspItem(item: BspItemDetail, priceMap: Record<string, number>): CatalogItem {
  const id = normaliseItemCode(item.itemCode);
  const name = normaliseDescription(item.shortDescription) || id;
  const barcode = item.packageIdentifiers?.[0]?.value;
  const image = item.imageUrls?.[0] ?? `https://picsum.photos/seed/${id}/160/160`;
  const category = item.departmentId ?? 'General';
  const price = priceMap[id] ?? 0;

  return { id, name, price, image, barcode, category };
}

export function useCatalog(query: string, category: string) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [usingLocal, setUsingLocal] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      void fetchItems();
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, category]);

  async function fetchItems() {
    setLoading(true);
    try {
      // Build query string
      const params = new URLSearchParams({ pageSize: '40' });
      if (query) params.set('q', query);

      const catalogResp = await bff.get<{
        itemDetails: BspItemDetail[];
        totalCount: number;
      }>(`/api/catalog/items?${params.toString()}`);

      let bspItems = catalogResp.itemDetails ?? [];

      // Filter by category locally (BSP doesn't support dept filter in basic search)
      if (category !== 'All') {
        bspItems = bspItems.filter(
          (i) => (i.departmentId ?? '').toLowerCase() === category.toLowerCase()
        );
      }

      // BSP is reachable — show its results even if empty for this filter.
      // Never show local catalog when BSP is live.

      // Batch fetch prices for the visible items
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
            // BSP returns price as a plain BigDecimal (number), not { amount }
            const p = (entry as any).price;
            priceMap[code] = typeof p === 'number' ? p : (p?.amount ?? entry.unitPrice ?? 0);
          }
        } catch {
          // prices unavailable — items will show $0; acceptable degradation
        }
      }

      setItems(bspItems.map((i) => normaliseBspItem(i, priceMap)));
      setUsingLocal(false);
    } catch (e) {
      // BFF unreachable — fall back to hardcoded catalog
      applyLocalFallback(query, category);
    } finally {
      setLoading(false);
    }
  }

  function applyLocalFallback(q: string, cat: string) {
    const filtered = CATALOG.filter((item) => {
      const matchCat = cat === 'All' || item.category === cat;
      const matchQ   = !q || item.name.toLowerCase().includes(q.toLowerCase());
      return matchCat && matchQ;
    });
    setItems(filtered);
    setUsingLocal(true);
  }

  return { items, loading, usingLocal };
}
