import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { useSettingsStore } from '../store/useSettingsStore';
import { bff } from '../lib/bffClient';

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const surchargesEnabled    = useSettingsStore((state) => state.surchargesEnabled);
  const setSurchargesEnabled = useSettingsStore((state) => state.setSurchargesEnabled);
  const emailReceiptsEnabled    = useSettingsStore((state) => state.emailReceiptsEnabled);
  const setEmailReceiptsEnabled = useSettingsStore((state) => state.setEmailReceiptsEnabled);
  const storeName    = useSettingsStore((state) => state.storeName);
  const setStoreName = useSettingsStore((state) => state.setStoreName);

  const [storeNameInput, setStoreNameInput] = useState(storeName);
  const [emailStatus, setEmailStatus] = useState<'loading' | 'configured' | 'unconfigured'>('loading');
  const [emailFromName, setEmailFromName] = useState<string | null>(null);

  // Check whether email is configured on the BFF
  useEffect(() => {
    bff.get<{ configured: boolean; fromName: string | null }>('/api/email/status')
      .then((res) => {
        setEmailStatus(res.configured ? 'configured' : 'unconfigured');
        setEmailFromName(res.fromName);
      })
      .catch(() => setEmailStatus('unconfigured'));
  }, []);

  const handleStoreNameBlur = () => {
    const trimmed = storeNameInput.trim() || 'Kmart';
    setStoreNameInput(trimmed);
    setStoreName(trimmed);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Payments */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payments</Text>
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Payment Surcharges</Text>
            <Text style={styles.rowSub}>Add 1.5% surcharge for Card and Mobile Payment</Text>
          </View>
          <Switch
            value={surchargesEnabled}
            onValueChange={setSurchargesEnabled}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Store */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Store</Text>
        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Store Name</Text>
            <Text style={styles.rowSub}>Shown on receipts and emails</Text>
          </View>
          <TextInput
            style={styles.textInput}
            value={storeNameInput}
            onChangeText={setStoreNameInput}
            onBlur={handleStoreNameBlur}
            placeholder="Kmart"
            placeholderTextColor={Colors.textLight}
            returnKeyType="done"
            onSubmitEditing={handleStoreNameBlur}
          />
        </View>
      </View>

      {/* Email Receipts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Email Receipts</Text>

        {/* SMTP status */}
        <View style={[styles.row, styles.statusRow]}>
          {emailStatus === 'loading' ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <Ionicons
                name={emailStatus === 'configured' ? 'checkmark-circle' : 'alert-circle-outline'}
                size={18}
                color={emailStatus === 'configured' ? Colors.success : Colors.warning}
              />
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>
                  {emailStatus === 'configured' ? 'SMTP configured' : 'SMTP not configured'}
                </Text>
                <Text style={styles.rowSub}>
                  {emailStatus === 'configured'
                    ? `Sending from ${emailFromName ?? 'server'}`
                    : 'Set EMAIL_SMTP_HOST / USER / PASS on the BFF server'}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, emailStatus !== 'configured' && styles.rowLabelDisabled]}>
              Prompt for email at checkout
            </Text>
            <Text style={styles.rowSub}>
              Ask for customer email after each completed order
            </Text>
          </View>
          <Switch
            value={emailReceiptsEnabled && emailStatus === 'configured'}
            onValueChange={setEmailReceiptsEnabled}
            disabled={emailStatus !== 'configured'}
            trackColor={{ false: Colors.border, true: Colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { padding: 4, marginRight: Spacing.sm },
  headerTitle: { ...Typography.h3, color: Colors.text, flex: 1 },
  section: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
  },
  statusRow: { gap: Spacing.sm },
  rowInfo: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' as const, color: Colors.text },
  rowLabelDisabled: { color: Colors.textLight },
  rowSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    fontSize: 14,
    color: Colors.text,
    minWidth: 100,
    textAlign: 'right',
  },
});
