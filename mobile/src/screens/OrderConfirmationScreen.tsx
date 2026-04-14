import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
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
      setEmailSent(true);
    } catch (error) {
      const msg = error instanceof BffError ? error.message : 'Could not send email. Try again.';
      showAlert('Email failed', msg);
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.successIcon}>
          <Text style={styles.checkmark}>✓</Text>
        </View>

        <Text style={styles.title}>Order Confirmed!</Text>
        <Text style={styles.subtitle}>Thank you for your purchase</Text>

        <View style={styles.orderDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Order ID</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              ...{orderId.toString().slice(-10)}
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
      </ScrollView>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'space-between',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl * 2,
    paddingBottom: Spacing.xl,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  checkmark: {
    fontSize: 50,
    color: Colors.background,
    fontWeight: 'bold',
  },
  title: {
    ...Typography.h2,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textLight,
    marginBottom: Spacing.xl,
  },
  orderDetails: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { ...Typography.body, color: Colors.textLight },
  detailValue: {
    ...Typography.body,
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
    paddingHorizontal: Spacing.lg,
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
