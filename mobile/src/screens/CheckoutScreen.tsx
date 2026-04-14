import React, { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useCartStore } from '../store/useCartStore';
import { useOrderStore } from '../store/useOrderStore';
import { useLoyaltyStore } from '../store/useLoyaltyStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { bff, BffError } from '../lib/bffClient';
import { Colors, Typography, Spacing, Radius } from '../theme';

const PAYMENT_METHODS = [
  { id: 'Cash',           emoji: '💵', label: 'Cash' },
  { id: 'Card',           emoji: '💳', label: 'Card' },
  { id: 'Mobile Payment', emoji: '📱', label: 'Mobile' },
];

// Card surcharge rate (applies to Card and Mobile Payment when surcharges are enabled)
const SURCHARGE_RATE = 0.015; // 1.5%
const SURCHARGE_METHODS = new Set(['Card', 'Mobile Payment']);

const BSP_PAYMENT_TYPE: Record<string, 'Cash' | 'CreditDebit' | 'Other'> = {
  Cash: 'Cash',
  Card: 'CreditDebit',
  'Mobile Payment': 'Other',
};

export default function CheckoutScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [selectedPayment, setSelectedPayment] = useState<string>(PAYMENT_METHODS[0].id);
  const [processing, setProcessing] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [lineDiscounts, setLineDiscounts] = useState<{ itemCode: string; discountAmount: number; promotionName: string }[]>([]);
  const [basketDiscount, setBasketDiscount] = useState(0);
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.total());
  const bspOrderId = useCartStore((state) => state.bspOrderId);
  const ensureSynced = useCartStore((state) => state.ensureSynced);
  const clearCartLocal = useCartStore((state) => state.clearCartLocal);
  const addOrder = useOrderStore((state) => state.addOrder);
  const staffId = useAuthStore((state) => state.staffId) ?? 'unknown';
  const flybuys = useLoyaltyStore((state) => state.flybuys);
  const teamMember = useLoyaltyStore((state) => state.teamMember);
  const onepass = useLoyaltyStore((state) => state.onepass);
  const surchargesEnabled = useSettingsStore((state) => state.surchargesEnabled);

  // Evaluate promotions on mount via BSP Promotions Engine
  useEffect(() => {
    if (items.length === 0) return;
    const loyaltyAccountId =
      flybuys?.accountId ?? teamMember?.accountId ?? onepass?.accountId;
    setPromoLoading(true);
    const loyaltyCardType = teamMember ? 'teamMember' : flybuys ? 'flybuys' : onepass ? 'onepass' : undefined;
    bff.post<{ discounts: typeof lineDiscounts; basketDiscount: number }>(
      '/api/promotions/evaluate',
      {
        items: items.map((i) => ({
          itemCode: i.id,
          quantity: i.quantity,
          unitPrice: i.price,
        })),
        ...(loyaltyAccountId ? { loyaltyAccountId } : {}),
        ...(loyaltyCardType ? { loyaltyCardType } : {}),
      },
    )
      .then((resp) => {
        setLineDiscounts(resp.discounts ?? []);
        setBasketDiscount(resp.basketDiscount ?? 0);
      })
      .catch(() => {})
      .finally(() => setPromoLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDiscount = parseFloat(
    (lineDiscounts.reduce((s, d) => s + d.discountAmount, 0) + basketDiscount).toFixed(2),
  );
  // Prices are GST-inclusive — no further ×1.10 needed
  const discountedSubtotal = parseFloat((total - totalDiscount).toFixed(2));
  const gstIncluded = parseFloat((Math.max(discountedSubtotal, 0) / 11).toFixed(2));
  const hasSurcharge = surchargesEnabled && SURCHARGE_METHODS.has(selectedPayment);
  const surchargeAmount = hasSurcharge
    ? parseFloat((Math.max(discountedSubtotal, 0) * SURCHARGE_RATE).toFixed(2))
    : 0;
  const grandTotal = parseFloat((Math.max(discountedSubtotal, 0) + surchargeAmount).toFixed(2));

  const handleCheckout = async () => {
    setProcessing(true);
    try {
      // Ensure BSP order exists — handles the case where async cart sync hasn't finished yet
      const orderId = bspOrderId ?? await ensureSynced();
      if (!orderId) {
        Alert.alert('Connection Error', 'Cannot reach server. Check your connection and try again.');
        return;
      }

      const result = await bff.post<{ ok: boolean; orderId: string; tlogId: string }>(
        '/api/order/checkout',
        {
          orderId,
          paymentType: BSP_PAYMENT_TYPE[selectedPayment] ?? 'Other',
          paymentAmount: grandTotal,
          staffId,
        },
      );

      // Accrue loyalty points for each active card (fire-and-forget)
      for (const [card, cardType] of [
        [flybuys, 'flybuys'],
        [teamMember, 'teamMember'],
        [onepass, 'onepass'],
      ] as const) {
        if (card) {
          void bff
            .post('/api/loyalty/accrue', {
              accountId: card.accountId,
              orderId: result.orderId,
              totalAmount: grandTotal,
              cardType,
            })
            .catch(() => {});
        }
      }

      // Build a lookup: cartKey (or itemCode fallback) → discount amount for this item
      const discountLookup: Record<string, number> = {};
      for (const d of lineDiscounts) {
        const key = d.cartKey ?? d.itemCode;
        discountLookup[key] = d.discountAmount;
      }

      addOrder({
        id: result.orderId,
        bspOrderId: result.orderId,
        total: grandTotal,
        surcharge: surchargeAmount > 0 ? surchargeAmount : undefined,
        paymentMethod: selectedPayment,
        refundedTotal: 0,
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        timestamp: new Date().toLocaleString(),
        status: 'completed',
        items: items.map((i) => {
          const discount = discountLookup[i.cartKey] ?? discountLookup[i.id] ?? 0;
          const effectivePrice = discount > 0
            ? parseFloat(((i.price * i.quantity - discount) / i.quantity).toFixed(4))
            : undefined;
          return { ...i, refundedQty: 0, ...(effectivePrice !== undefined ? { effectivePrice } : {}) };
        }),
      });
      clearCartLocal();

      navigation.navigate('OrderConfirmation', {
        orderId: result.orderId,
        total: grandTotal,
        tlogId: result.tlogId,
      });
    } catch (error) {
      const msg = error instanceof BffError ? error.message : 'Payment failed. Please try again.';
      Alert.alert('Payment Failed', msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Scrollable order summary — items + totals only */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Order Summary</Text>
        {items.map((item) => (
          <View key={item.cartKey} style={styles.summaryRow}>
            <View style={styles.summaryTextWrap}>
              <Text style={styles.summaryText}>
                {item.quantity}x {item.name}
              </Text>
            </View>
            <Text style={styles.summaryPrice}>
              ${(item.price * item.quantity).toFixed(2)}
            </Text>
          </View>
        ))}

        <View style={styles.divider} />

        <View style={styles.totalSummary}>
          <Text style={styles.totalLabel}>Subtotal:</Text>
          <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
        </View>

        {/* Promotions savings */}
        {promoLoading && (
          <ActivityIndicator size="small" color={Colors.success} style={{ marginVertical: 4 }} />
        )}
        {lineDiscounts.map((d, i) => (
          <View key={i} style={styles.totalSummary}>
            <Text style={styles.promoLabel}>{d.promotionName}</Text>
            <Text style={styles.promoValue}>-${d.discountAmount.toFixed(2)}</Text>
          </View>
        ))}
        {basketDiscount > 0 && (
          <View style={styles.totalSummary}>
            <Text style={styles.promoLabel}>
              {teamMember ? 'Team Member Discount' : flybuys ? 'Flybuys Savings' : onepass ? 'OnePass Savings' : 'Your Savings'}
            </Text>
            <Text style={styles.promoValue}>-${basketDiscount.toFixed(2)}</Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed bottom panel — always visible regardless of list length */}
      <View style={[styles.bottomPanel, { paddingBottom: Math.max(Spacing.xl, insets.bottom + Spacing.md) }]}>
        {hasSurcharge && (
          <View style={styles.totalSummary}>
            <Text style={styles.surchargeLabel}>{selectedPayment} surcharge (1.5%):</Text>
            <Text style={styles.surchargeValue}>${surchargeAmount.toFixed(2)}</Text>
          </View>
        )}
        <View style={[styles.totalSummary, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total (inc. GST):</Text>
          <Text style={styles.grandTotalValue}>${grandTotal.toFixed(2)}</Text>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: Spacing.md }]}>Payment Method</Text>

        <View style={styles.paymentRow}>
          {PAYMENT_METHODS.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.paymentOption,
                selectedPayment === method.id && styles.paymentOptionSelected,
              ]}
              onPress={() => setSelectedPayment(method.id)}
            >
              <Text style={styles.paymentEmoji}>{method.emoji}</Text>
              <Text style={[styles.paymentText, selectedPayment === method.id && styles.paymentTextSelected]}>
                {method.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footerButtons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={processing}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.confirmButton, processing && styles.buttonDisabled]}
            onPress={handleCheckout}
            disabled={processing}
          >
            <Text style={styles.confirmButtonText}>
              {processing ? 'Processing...' : 'Confirm Payment'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  summaryTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  summaryText: {
    ...Typography.body,
    color: Colors.text,
  },
  summaryPrice: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600' as const,
    flexShrink: 0,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  totalSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  totalLabel: {
    ...Typography.body,
    color: Colors.textLight,
  },
  totalValue: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  grandTotal: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  promoLabel: {
    ...Typography.body,
    color: Colors.success,
  },
  promoValue: {
    ...Typography.body,
    color: Colors.success,
    fontWeight: '600' as const,
  },
  grandTotalLabel: {
    ...Typography.h3,
    color: Colors.text,
  },
  grandTotalValue: {
    ...Typography.h3,
    color: Colors.primary,
  },
  surchargeLabel: {
    ...Typography.body,
    color: Colors.warning,
  },
  surchargeValue: {
    ...Typography.body,
    color: Colors.warning,
    fontWeight: '600' as const,
  },
  bottomPanel: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    gap: 2,
  },
  paymentOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.background,
  },
  paymentEmoji: {
    fontSize: 22,
  },
  paymentText: {
    ...Typography.body,
    color: Colors.textLight,
    fontWeight: '600',
    fontSize: 12,
  },
  paymentTextSelected: {
    color: Colors.primary,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...Typography.button,
    color: Colors.primary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  confirmButtonText: {
    ...Typography.button,
    color: Colors.background,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
