import { create } from 'zustand';
import { bff } from '../lib/bffClient';

export interface CartItem {
  id: string;
  cartKey: string;       // unique per product+size+color combo
  name: string;
  price: number;
  quantity: number;
  image?: string | number;
  barcode?: string;
  size?: string;
  color?: string;
  bspLineId?: string;    // BSP order line ID — needed for void/remove
}

interface CartState {
  items: CartItem[];
  bspOrderId: string | null;
  addItem: (item: CartItem) => void;
  removeItem: (cartKey: string) => void;
  updateQuantity: (cartKey: string, quantity: number) => void;
  clearCart: () => void;
  clearCartLocal: () => void;  // post-checkout: clears local state without cancelling BSP order
  ensureSynced: () => Promise<string | null>; // guarantees BSP order exists; creates + adds all lines if not
  total: () => number;
}

type SetFn = (partial: Partial<CartState>) => void;
type GetFn = () => CartState;

/** Ensures a BSP order exists; creates one if not. Returns the orderId or null on failure. */
async function getOrCreateOrder(get: GetFn, set: SetFn): Promise<string | null> {
  const existing = get().bspOrderId;
  if (existing) return existing;
  try {
    const data = await bff.post<{ id?: string }>('/api/cart/create', { currency: 'AUD' });
    const newId = data?.id ?? null;
    if (newId) set({ bspOrderId: newId });
    return newId;
  } catch {
    return null;
  }
}

/** Adds a line to the BSP order; returns the lineId from the BSP response. */
async function addBspLine(
  orderId: string,
  item: CartItem,
  quantity: number,
): Promise<string | undefined> {
  try {
    const data = await bff.post<{
      orderLines?: Array<{ lineId?: string; productId?: { value?: string } }>;
    }>(`/api/cart/${orderId}/lines`, {
      itemCode: item.id,
      description: item.name,
      quantity,
      unitPrice: item.price,
    });
    // Find the most recent line for this itemCode to get its BSP lineId
    const lines = data?.orderLines ?? [];
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].productId?.value === item.id) return lines[i].lineId;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Voids a line on the BSP order. Fire-and-forget. */
async function voidBspLine(orderId: string, lineId: string): Promise<void> {
  try {
    await bff.delete(`/api/cart/${orderId}/lines/${lineId}`);
  } catch {
    // fire-and-forget — UI state already updated
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  bspOrderId: null,

  addItem: (incoming) => {
    const existing = get().items.find((i) => i.cartKey === incoming.cartKey);

    if (existing) {
      // Optimistic: merge quantity immediately
      const newQty = existing.quantity + incoming.quantity;
      set({
        items: get().items.map((i) =>
          i.cartKey === incoming.cartKey ? { ...i, quantity: newQty } : i,
        ),
      });
      // BSP sync: void old line + re-add with updated total qty
      void (async () => {
        const orderId = await getOrCreateOrder(get, set);
        if (!orderId) return;
        if (existing.bspLineId) await voidBspLine(orderId, existing.bspLineId);
        const lineId = await addBspLine(orderId, existing, newQty);
        if (lineId) {
          set({
            items: get().items.map((i) =>
              i.cartKey === incoming.cartKey ? { ...i, bspLineId: lineId } : i,
            ),
          });
        }
      })();
    } else {
      // Optimistic: add item immediately
      set({ items: [...get().items, incoming] });
      // BSP sync: create order if needed, then add line
      void (async () => {
        const orderId = await getOrCreateOrder(get, set);
        if (!orderId) return;
        const lineId = await addBspLine(orderId, incoming, incoming.quantity);
        if (lineId) {
          set({
            items: get().items.map((i) =>
              i.cartKey === incoming.cartKey ? { ...i, bspLineId: lineId } : i,
            ),
          });
        }
      })();
    }
  },

  removeItem: (cartKey) => {
    const item = get().items.find((i) => i.cartKey === cartKey);
    const orderId = get().bspOrderId;
    set({ items: get().items.filter((i) => i.cartKey !== cartKey) });
    if (orderId && item?.bspLineId) {
      void voidBspLine(orderId, item.bspLineId);
    }
  },

  updateQuantity: (cartKey, quantity) => {
    if (quantity <= 0) {
      get().removeItem(cartKey);
      return;
    }
    const item = get().items.find((i) => i.cartKey === cartKey);
    set({
      items: get().items.map((i) =>
        i.cartKey === cartKey ? { ...i, quantity } : i,
      ),
    });
    if (!item) return;
    // BSP sync: void old line + re-add with new qty
    void (async () => {
      const orderId = await getOrCreateOrder(get, set);
      if (!orderId) return;
      if (item.bspLineId) await voidBspLine(orderId, item.bspLineId);
      const lineId = await addBspLine(orderId, item, quantity);
      if (lineId) {
        set({
          items: get().items.map((i) =>
            i.cartKey === cartKey ? { ...i, bspLineId: lineId } : i,
          ),
        });
      }
    })();
  },

  clearCart: () => {
    const orderId = get().bspOrderId;
    set({ items: [], bspOrderId: null });
    if (orderId) void bff.delete(`/api/cart/${orderId}`).catch(() => {});
    // reset loyalty for new transaction — lazy require avoids circular dep
    const { useLoyaltyStore } = require('./useLoyaltyStore');
    useLoyaltyStore.getState().clearAll();
  },

  clearCartLocal: () => {
    // Used after checkout: the BSP order is already finalised — do NOT cancel it
    set({ items: [], bspOrderId: null });
    const { useLoyaltyStore } = require('./useLoyaltyStore');
    useLoyaltyStore.getState().clearAll();
  },

  ensureSynced: async () => {
    // If BSP order already exists, return it immediately
    const existing = get().bspOrderId;
    if (existing) return existing;

    // No order yet (async cart sync may not have finished) — create it now
    const orderId = await getOrCreateOrder(get, set);
    if (!orderId) return null;

    // Add any items that never got a BSP line (fire-and-forget individually)
    const unsynced = get().items.filter((i) => !i.bspLineId);
    await Promise.all(
      unsynced.map(async (item) => {
        const lineId = await addBspLine(orderId, item, item.quantity);
        if (lineId) {
          set({
            items: get().items.map((i) =>
              i.cartKey === item.cartKey ? { ...i, bspLineId: lineId } : i,
            ),
          });
        }
      }),
    );

    return orderId;
  },

  total: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
}));
