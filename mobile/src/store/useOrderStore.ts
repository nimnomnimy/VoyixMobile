import { create } from 'zustand';
import { CartItem } from './useCartStore';

export interface OrderLineItem extends CartItem {
  refundedQty: number;       // how many units have been refunded (0 = none)
  effectivePrice?: number;   // actual price per unit charged after promotions (undefined = full price)
}

export interface Order {
  id: string;
  bspOrderId?: string;  // BSP order ID (same as id for live orders)
  total: number;
  refundedTotal: number;
  itemCount: number;
  timestamp: string;
  status: 'completed' | 'partially_refunded' | 'refunded' | 'suspended';
  items: OrderLineItem[];
}

interface RefundSelection {
  cartKey: string;
  qty: number;  // how many units to refund
}

interface OrderState {
  orders: Order[];
  addOrder: (order: Order) => void;
  refundItems: (orderId: string, selections: RefundSelection[], refundAmount: number) => void;
  suspendOrder: (order: Order) => void;
  removeOrder: (orderId: string) => void;
  syncFromBsp: (bspOrders: Order[]) => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],

  addOrder: (order) => set({ orders: [order, ...get().orders] }),

  suspendOrder: (order) => set({ orders: [order, ...get().orders] }),

  removeOrder: (orderId) =>
    set({ orders: get().orders.filter((o) => o.id !== orderId) }),

  refundItems: (orderId, selections, refundAmount) => {
    set({
      orders: get().orders.map((order) => {
        if (order.id !== orderId) return order;

        const selMap = new Map(selections.map((s) => [s.cartKey, s.qty]));
        const updatedItems = order.items.map((item) => {
          const refundQty = selMap.get(item.cartKey) ?? 0;
          return { ...item, refundedQty: item.refundedQty + refundQty };
        });

        const newRefundedTotal = parseFloat(
          Math.min(order.refundedTotal + refundAmount, order.total).toFixed(2),
        );
        const allRefunded = updatedItems.every((i) => i.refundedQty >= i.quantity);
        const anyRefunded = updatedItems.some((i) => i.refundedQty > 0);

        return {
          ...order,
          items: updatedItems,
          refundedTotal: newRefundedTotal,
          status: allRefunded ? 'refunded' : anyRefunded ? 'partially_refunded' : 'completed',
        };
      }),
    });
  },

  syncFromBsp: (bspOrders) => {
    const existing = get().orders;
    const existingIds = new Set(existing.map((o) => o.bspOrderId ?? o.id));
    // Only add orders not already tracked locally
    const newOrders = bspOrders.filter((o) => !existingIds.has(o.id));
    if (newOrders.length > 0) {
      set({ orders: [...existing, ...newOrders] });
    }
  },
}));
