import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageStyle,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { showAlert } from '../lib/webAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOrderStore, OrderLineItem } from '../store/useOrderStore';
import { useCartStore } from '../store/useCartStore';
import { useAuthStore } from '../store/useAuthStore';
import { bff, BffError } from '../lib/bffClient';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { imageSource } from '../data/catalog';

export default function OrderDetailScreen({ route, navigation }: any) {
  const { orderId } = route.params;
  const order = useOrderStore((state) => state.orders.find((o) => o.id === orderId));
  const refundItems = useOrderStore((state) => state.refundItems);
  const removeOrder = useOrderStore((state) => state.removeOrder);
  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const setBspOrderId = useCartStore((state) => state.setBspOrderId);
  const staffId = useAuthStore((state) => state.staffId) ?? 'unknown';

  const [refundMode, setRefundMode] = useState(false);
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [refundQtys, setRefundQtys] = useState<Record<string, number>>({});
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundCalcLoading, setRefundCalcLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  if (!order) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFound}>Order not found</Text>
      </View>
    );
  }

  const refundableItems = order.items.filter((i) => i.refundedQty < i.quantity);
  const anySelected = Object.values(refundQtys).some((q) => q > 0);
  const remainingBalance = parseFloat((order.total - order.refundedTotal).toFixed(2));

  // Promo-unwind refund calculation:
  // refund = current_balance − what_customer_should_have_paid_for_remaining_items
  // e.g. B2G1F: return the free item → remaining 2 items = full price = no refund
  useEffect(() => {
    if (!refundMode) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!anySelected) { setRefundAmount(0); return; }

    // Build remaining basket: original items minus already-refunded minus being-returned
    const remaining = order.items
      .map((i) => {
        const returning = refundQtys[i.cartKey] ?? 0;
        const qty = i.quantity - i.refundedQty - returning;
        return { cartKey: i.cartKey, itemCode: i.id, quantity: qty, unitPrice: i.price };
      })
      .filter((i) => i.quantity > 0);

    // Returning everything left → full remaining balance
    if (remaining.length === 0) {
      setRefundAmount(remainingBalance);
      return;
    }

    setRefundCalcLoading(true);
    debounceRef.current = setTimeout(() => {
      bff.post<{ discounts: { discountAmount: number }[]; basketDiscount: number }>(
        '/api/promotions/evaluate',
        { items: remaining },
      )
        .then((resp) => {
          const promoSavings =
            (resp.discounts ?? []).reduce((s, d) => s + d.discountAmount, 0) +
            (resp.basketDiscount ?? 0);
          const remainingSubtotal = remaining.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
          const newBasketTotal = parseFloat(
            Math.max(0, remainingSubtotal - promoSavings).toFixed(2),
          );
          const calculated = parseFloat(
            Math.max(0, Math.min(remainingBalance - newBasketTotal, remainingBalance)).toFixed(2),
          );
          setRefundAmount(calculated);
        })
        .catch(() => {
          // Fallback: simple per-item calculation capped at remaining balance
          const simple = Object.entries(refundQtys).reduce((sum, [cartKey, qty]) => {
            const item = order.items.find((i) => i.cartKey === cartKey);
            return sum + (item ? (item.effectivePrice ?? item.price) * qty : 0);
          }, 0);
          setRefundAmount(parseFloat(Math.min(simple, remainingBalance).toFixed(2)));
        })
        .finally(() => setRefundCalcLoading(false));
    }, 300);
  }, [JSON.stringify(refundQtys), refundMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRefundQty = (cartKey: string, qty: number) => {
    setRefundQtys((prev) => ({ ...prev, [cartKey]: qty }));
  };

  const handleResume = () => {
    if (!order) return;
    if (cartItems.length > 0) {
      showAlert(
        'Active Transaction',
        'You have items in your cart. Resuming will replace the current cart.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace & Resume', style: 'destructive', onPress: () => void doResume() },
        ]
      );
    } else {
      void doResume();
    }
  };

  const doResume = async () => {
    if (!order) return;
    // Snapshot before any state mutations
    const resumeId = order.id;
    const resumeBspOrderId = order.bspOrderId;
    const resumeItems = order.items.slice();

    if (resumeBspOrderId) {
      // Reactivate BSP order (InProgress → OrderPlaced) and retrieve loyalty state
      let loyalty: { flybuys?: any; teamMember?: any; onepass?: any } | null = null;
      try {
        const result = await bff.post<{ loyalty?: any }>(`/api/cart/${resumeBspOrderId}/reactivate`, {});
        loyalty = result.loyalty ?? null;
      } catch {
        // Continue anyway — cart will re-sync on next interaction
      }
      // Restore local cart state pointing at the existing BSP order
      clearCart();
      setBspOrderId(resumeBspOrderId);
      resumeItems.forEach((item) => {
        const { refundedQty, effectivePrice, ...cartItem } = item;
        // Keep bspLineId so the cart knows about existing BSP lines
        addItem(cartItem);
      });
      // Restore loyalty cards saved at suspend time
      if (loyalty) {
        const { useLoyaltyStore } = require('../store/useLoyaltyStore');
        const ls = useLoyaltyStore.getState();
        if (loyalty.flybuys)    ls.setCard('flybuys',    loyalty.flybuys.cardNumber);
        if (loyalty.teamMember) ls.setCard('teamMember', loyalty.teamMember.cardNumber);
        if (loyalty.onepass)    ls.setCard('onepass',    loyalty.onepass.cardNumber);
      }
    } else {
      // Local-only suspended order — fresh cart
      clearCart();
      resumeItems.forEach((item) => {
        const { refundedQty, effectivePrice, bspLineId, ...cartItem } = item;
        addItem(cartItem);
      });
    }

    navigation.goBack();
    setTimeout(() => {
      removeOrder(resumeId);
      navigation.navigate('Main', { screen: 'Cart' });
    }, 50);
  };

  const handleCancelSuspended = () => {
    showAlert(
      'Cancel Transaction',
      `Cancel suspended transaction ${order.id}? This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Transaction',
          style: 'destructive',
          onPress: () => {
            if (order.bspOrderId) {
              bff.delete(`/api/cart/${order.bspOrderId}`).catch(() => {});
            }
            removeOrder(order.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const handleStartRefund = () => {
    if (refundableItems.length === 0) {
      showAlert('No items to refund', 'All items have already been fully refunded.');
      return;
    }
    // initialise all refundable items to 0
    const init: Record<string, number> = {};
    refundableItems.forEach((i) => { init[i.cartKey] = 0; });
    setRefundQtys(init);
    setRefundMode(true);
  };

  const handleConfirmRefund = () => {
    if (!anySelected) {
      showAlert('Nothing selected', 'Set a return quantity on at least one item.');
      return;
    }
    const selections = Object.entries(refundQtys)
      .filter(([, qty]) => qty > 0)
      .map(([cartKey, qty]) => ({ cartKey, qty }));

    const lineCount = selections.length;
    const refundLabel = refundAmount === 0
      ? 'No refund due (promotions still apply to remaining items)'
      : `Refund $${refundAmount.toFixed(2)} to card`;

    showAlert(
      'Confirm Refund',
      `${refundLabel}\n${lineCount} line(s) being returned.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: refundAmount === 0 ? 'Confirm Return' : 'Refund to Card',
          style: 'destructive',
          onPress: () => void doRefund(selections),
        },
      ],
    );
  };

  const doRefund = async (selections: { cartKey: string; qty: number }[]) => {
    setRefundProcessing(true);
    try {
      if (order?.bspOrderId) {
        const bspLines = selections
          .map(({ cartKey, qty }) => {
            const item = order.items.find((i) => i.cartKey === cartKey);
            return item?.bspLineId ? { lineId: item.bspLineId, quantity: qty } : null;
          })
          .filter((l): l is { lineId: string; quantity: number } => l !== null);

        if (bspLines.length > 0) {
          await bff.post(`/api/order/${order.bspOrderId}/refund`, {
            lines: bspLines,
            staffId,
            paymentType: 'CreditDebit',
            refundAmount,
          });
        }
      }
      refundItems(orderId, selections, refundAmount);
      setRefundMode(false);
      setRefundQtys({});
      setRefundAmount(0);
      const msg = refundAmount === 0
        ? 'Items returned. No refund due — promotions still apply to remaining items.'
        : `$${refundAmount.toFixed(2)} refunded to card.`;
      showAlert('Return processed', msg);
    } catch (error) {
      const msg = error instanceof BffError ? error.message : 'Refund failed. Please try again.';
      showAlert('Refund Failed', msg);
    } finally {
      setRefundProcessing(false);
    }
  };

  const renderItem = (item: OrderLineItem) => {
    const fullyRefunded = item.refundedQty >= item.quantity;
    const partiallyRefunded = item.refundedQty > 0 && !fullyRefunded;
    const remainingQty = item.quantity - item.refundedQty;
    const refundQty = refundQtys[item.cartKey] ?? 0;

    return (
      <View
        key={item.cartKey}
        style={[styles.itemRow, fullyRefunded && styles.itemRefunded]}
      >
        {imageSource(item.image) && (
          <Image source={imageSource(item.image) as any} style={styles.itemImage as ImageStyle} />
        )}
        <View style={styles.itemInfo}>
          <Text style={[styles.itemName, fullyRefunded && styles.strikethrough]} numberOfLines={2}>
            {item.name}
          </Text>
          {(item.size || item.color) && (
            <View style={styles.badgeRow}>
              {item.size && <View style={styles.badge}><Text style={styles.badgeText}>{item.size}</Text></View>}
              {item.color && <View style={styles.badge}><Text style={styles.badgeText}>{item.color}</Text></View>}
            </View>
          )}
          <View style={styles.qtyRow}>
            <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
            {item.refundedQty > 0 && (
              <Text style={styles.refundedQtyText}> · {item.refundedQty} refunded</Text>
            )}
          </View>
        </View>

        <View style={styles.itemRight}>
          <Text style={[styles.itemPrice, fullyRefunded && styles.strikethrough]}>
            ${(item.price * item.quantity).toFixed(2)}
          </Text>

          {/* Status badges */}
          {fullyRefunded && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.error }]}>
              <Text style={styles.statusBadgeText}>Refunded</Text>
            </View>
          )}
          {partiallyRefunded && (
            <View style={[styles.statusBadge, { backgroundColor: Colors.warning }]}>
              <Text style={styles.statusBadgeText}>Part Refunded</Text>
            </View>
          )}

          {/* Refund quantity stepper */}
          {refundMode && !fullyRefunded && (
            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.stepBtn, refundQty === 0 && styles.stepBtnDisabled]}
                onPress={() => setRefundQty(item.cartKey, Math.max(0, refundQty - 1))}
                disabled={refundQty === 0}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{refundQty}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, refundQty >= remainingQty && styles.stepBtnDisabled]}
                onPress={() => setRefundQty(item.cartKey, Math.min(remainingQty, refundQty + 1))}
                disabled={refundQty >= remainingQty}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            #{order.id.length > 12 ? order.id.slice(-12) : order.id}
          </Text>
          <Text style={styles.headerSub}>{order.timestamp}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Summary */}
        {(() => {
          const itemsSubtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
          // Prices are GST-inclusive; surcharge is stored separately
          const subtotalBeforeSurcharge = parseFloat((order.total - (order.surcharge ?? 0)).toFixed(2));
          const gstIncluded = parseFloat((subtotalBeforeSurcharge / 11).toFixed(2));
          const savings = parseFloat((itemsSubtotal - subtotalBeforeSurcharge).toFixed(2));
          return (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Items Subtotal</Text>
                <Text style={styles.summaryValue}>${itemsSubtotal.toFixed(2)}</Text>
              </View>
              {savings > 0.009 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: Colors.success }]}>Savings</Text>
                  <Text style={[styles.summaryValue, { color: Colors.success }]}>-${savings.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>GST included (1/11)</Text>
                <Text style={styles.summaryValue}>${gstIncluded.toFixed(2)}</Text>
              </View>
              {order.surcharge != null && order.surcharge > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: Colors.warning }]}>
                    {order.paymentMethod ?? 'Card'} surcharge (1.5%)
                  </Text>
                  <Text style={[styles.summaryValue, { color: Colors.warning }]}>
                    ${order.surcharge.toFixed(2)}
                  </Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.summaryNetRow]}>
                <Text style={styles.summaryNetLabel}>Order Total</Text>
                <Text style={styles.summaryNetValue}>${order.total.toFixed(2)}</Text>
              </View>
              <TouchableOpacity
                style={styles.bspIdRow}
                onPress={() => {
                  Clipboard.setString(order.bspOrderId);
                  showAlert('Copied', 'BSP Order ID copied to clipboard');
                }}
              >
                <Text style={styles.bspIdLabel}>BSP Order ID</Text>
                <Text style={styles.bspIdValue} numberOfLines={1}>{order.bspOrderId}</Text>
                <Text style={styles.bspIdCopy}>Copy</Text>
              </TouchableOpacity>
              {order.refundedTotal > 0 && (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: Colors.error }]}>Refunded</Text>
                    <Text style={[styles.summaryValue, { color: Colors.error }]}>
                      -${order.refundedTotal.toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryNetRow]}>
                    <Text style={styles.summaryNetLabel}>Net Total</Text>
                    <Text style={styles.summaryNetValue}>
                      ${(order.total - order.refundedTotal).toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          );
        })()}

        {refundMode && (
          <Text style={styles.refundHint}>Set the return quantity for each item using + / −</Text>
        )}

        <Text style={styles.sectionLabel}>Items</Text>
        {order.items.map(renderItem)}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(32, insets.bottom + Spacing.md) }]}>
        {order.status === 'suspended' ? (
          <View style={styles.rowActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSuspended}>
              <Text style={[styles.cancelButtonText, { color: Colors.error }]}>Cancel Txn</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resumeButton} onPress={handleResume}>
              <Ionicons name="play-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.actionButtonText}>Resume</Text>
            </TouchableOpacity>
          </View>
        ) : !refundMode ? (
          <TouchableOpacity
            style={[styles.refundButton, order.status === 'refunded' && styles.buttonDisabled]}
            onPress={handleStartRefund}
            disabled={order.status === 'refunded'}
          >
            <Ionicons name="return-down-back-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>
              {order.status === 'refunded' ? 'Fully Refunded' : 'Return Items'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.rowActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => { setRefundMode(false); setRefundQtys({}); }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, (!anySelected || refundProcessing) && styles.buttonDisabled]}
              onPress={handleConfirmRefund}
              disabled={!anySelected || refundProcessing}
            >
              {refundProcessing || refundCalcLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {!anySelected
                    ? 'Refund'
                    : refundAmount === 0
                    ? 'Confirm Return ($0)'
                    : `Refund $${refundAmount.toFixed(2)}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  notFound: { ...Typography.body, color: Colors.textLight, textAlign: 'center', marginTop: 80 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  backButton: { padding: 4 },
  headerCenter: { flex: 1 },
  headerTitle: { ...Typography.h3, color: Colors.text },
  headerSub: { ...Typography.caption, color: Colors.textLight, marginTop: 2 },

  scroll: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.md },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  summaryLabel: { ...Typography.body, color: Colors.textLight },
  summaryValue: { ...Typography.body, color: Colors.text, fontWeight: '600' as const },
  summaryNetRow: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.sm, paddingTop: Spacing.sm },
  summaryNetLabel: { ...Typography.h3, color: Colors.text },
  summaryNetValue: { ...Typography.h3, color: Colors.primary },
  bspIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  bspIdLabel: { fontSize: 11, color: Colors.textLight, fontWeight: '600' as const },
  bspIdValue: { flex: 1, fontSize: 11, color: Colors.textLight, fontFamily: 'monospace' },
  bspIdCopy: { fontSize: 11, color: Colors.primary, fontWeight: '700' as const },

  refundHint: {
    ...Typography.caption,
    color: Colors.secondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
    fontStyle: 'italic',
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.textLight,
    fontWeight: '600' as const,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  itemRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemRefunded: { opacity: 0.45 },
  itemImage: { width: 52, height: 52, borderRadius: Radius.sm, backgroundColor: Colors.border },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '600' as const, color: Colors.text },
  strikethrough: { textDecorationLine: 'line-through', color: Colors.textLight },
  badgeRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  badge: { backgroundColor: Colors.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' as const },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  itemQty: { ...Typography.caption, color: Colors.textLight },
  refundedQtyText: { ...Typography.caption, color: Colors.error },

  itemRight: { alignItems: 'flex-end', gap: 6 },
  itemPrice: { fontSize: 13, fontWeight: '700' as const, color: Colors.text },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' as const },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnDisabled: { backgroundColor: Colors.border },
  stepBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  stepValue: { minWidth: 24, textAlign: 'center', fontSize: 15, fontWeight: '600' as const, color: Colors.text },

  footer: {
    padding: Spacing.lg,
    paddingBottom: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rowActions: { flexDirection: 'row', gap: Spacing.md },
  refundButton: {
    backgroundColor: Colors.secondary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumeButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.success,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButton: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelButtonText: { fontSize: 16, fontWeight: '600' as const, color: Colors.textLight },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
  buttonDisabled: { opacity: 0.4 },
});
