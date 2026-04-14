import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import QRCodeSvg from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { useSettingsStore } from '../store/useSettingsStore';
import { useOrderStore } from '../store/useOrderStore';
import { bff, BffError } from '../lib/bffClient';
import { showAlert } from '../lib/webAlert';

export default function OrderConfirmationScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { orderId, total } = route.params;

  const emailReceiptsEnabled = useSettingsStore((state) => state.emailReceiptsEnabled);
  const storeName = useSettingsStore((state) => state.storeName);
  const order = useOrderStore((state) => state.orders.find((o) => o.id === orderId));

  const [email, setEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const qrValue = order?.bspOrderId ?? orderId.toString();

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const handleSendReceipt = async () => {
    if (!isValidEmail(email)) {
      showAlert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!order) {
      showAlert('Error', 'Order data not available.');
      return;
    }
    setEmailSending(true);
    try {
      await bff.post('/api/email/receipt', {
        to: email.trim(),
        orderId: order.id,
        timestamp: order.timestamp,
        items: order.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          effectivePrice: i.effectivePrice,
        })),
        total: order.total,
        surcharge: order.surcharge,
        paymentMethod: order.paymentMethod,
        storeName,
      });
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (error) {
      const msg = error instanceof BffError ? error.message : 'Could not send email. Try again.';
      showAlert('Email failed', msg);
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets
    >
      {/* QR code */}
      <View style={styles.qrContainer}>
        <QRCodeSvg value={qrValue} size={180} />
      </View>

      <Text style={styles.title}>Order Confirmed!</Text>
      <Text style={styles.subtitle}>Thank you for your purchase</Text>

      <View style={styles.orderDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Order ID</Text>
          <Text style={styles.detailValue} numberOfLines={2} adjustsFontSizeToFit>
            {orderId.toString()}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Amount</Text>
          <Text style={styles.detailValue}>${(total as number).toFixed(2)}</Text>
        </View>
        <View style={[styles.detailRow, styles.detailRowLast]}>
          <Text style={styles.detailLabel}>Time</Text>
          <Text style={styles.detailValue}>{new Date().toLocaleTimeString()}</Text>
        </View>
      </View>

      {/* Email receipt section */}
      {emailReceiptsEnabled && !emailSent && (
        <View style={styles.emailSection}>
          <Text style={styles.emailLabel}>Email receipt to customer</Text>
          <View style={styles.emailRow}>
            <TextInput
              style={styles.emailInput}
              value={email}
              onChangeText={setEmail}
              placeholder="customer@email.com"
              placeholderTextColor={Colors.textLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSendReceipt}
              editable={!emailSending}
            />
            <TouchableOpacity
              style={[styles.sendButton, (emailSending || !email) && styles.sendButtonDisabled]}
              onPress={handleSendReceipt}
              disabled={emailSending || !email}
            >
              {emailSending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {emailSent && (
        <View style={styles.emailSentBanner}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
          <Text style={styles.emailSentText}>Receipt sent to {email}</Text>
        </View>
      )}

      <View style={[styles.footer, { paddingBottom: Spacing.lg + insets.bottom }]}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
          }}
        >
          <Text style={styles.buttonText}>New Transaction</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.h2,
    color: Colors.text,
    marginBottom: Spacing.xs ?? 4,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textLight,
    marginBottom: Spacing.md,
  },
  orderDetails: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 13, color: Colors.textLight },
  detailValue: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: Spacing.md,
  },

  emailSection: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  emailLabel: {
    fontSize: 13,
    color: Colors.textLight,
    marginBottom: Spacing.sm,
  },
  emailRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  emailInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },

  emailSentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    width: '100%',
  },
  emailSentText: { fontSize: 13, color: Colors.success, fontWeight: '500' as const },

  footer: {
    width: '100%',
    paddingTop: Spacing.lg,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  buttonText: {
    ...Typography.button,
    color: Colors.background,
  },
});
