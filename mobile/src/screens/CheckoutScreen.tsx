import React, { useState, useEffect } from 'react';
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

const PAYMENT_METHODS = ['Cash', 'Card', 'Mobile Payment'];

// Card surcharge rate (applies to Card and Mobile Payment when surcharges are enabled)
const SURCHARGE_RATE = 0.015; // 1.5%
const SURCHARGE_METHODS = new Set(['Card', 'Mobile Payment']);

const BSP_PAYMENT_TYPE: Record<string, 'Cash' | 'CreditDebit' | 'Other'> = {
  Cash: 'Cash',
  Card: 'CreditDebit',
  'Mobile Payment': 'Other',
};

export default function CheckoutScreen({ navigation }: any) {
  const [selectedPayment, setSelectedPayment] = useState<string>(PAYMENT_METHODS[0]);
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
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
            <Text style={styles.promoLabel}>Basket Discount</Text>
            <Text style={styles.promoValue}>-${basketDiscount.toFixed(2)}</Text>
          </View>
        )}
        {totalDiscount > 0 && (
          <View style={styles.totalSummary}>
            <Text style={styles.totalLabel}>Discounted Subtotal:</Text>
            <Text style={styles.totalValue}>${discountedSubtotal.toFixed(2)}</Text>
          </View>
        )}

        <View style={styles.totalSummary}>
          <Text style={styles.totalLabel}>GST included (1/11):</Text>
          <Text style={styles.totalValue}>${gstIncluded.toFixed(2)}</Text>
        </View>
        {hasSurcharge && (
          <View style={styles.totalSummary}>
            <Text style={styles.surchargeLabel}>{selectedPayment} surcharge (1.5%):</Text>
            <Text style={styles.surchargeValue}>${surchargeAmount.toFixed(2)}</Text>
          </View>
        )}
        <View style={[styles.totalSummary, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>Total:</Text>
          <Text style={styles.grandTotalValue}>${grandTotal.toFixed(2)}</Text>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
          Payment Method
        </Text>

        {PAYMENT_METHODS.map((method) => (
          <TouchableOpacity
            key={method}
            style={[
              styles.paymentOption,
              selectedPayment === method && styles.paymentOptionSelected,
            ]}
            onPress={() => setSelectedPayment(method)}
          >
            <View style={styles.radioButton}>
              {selectedPayment === method && (
                <View style={styles.radioButtonInner} />
              )}
            </View>
            <Text style={styles.paymentText}>{method}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
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
    marginVertical: Spacing.md,
  },
  totalSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
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
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  paymentOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  paymentText: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
