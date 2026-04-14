import React from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { useSettingsStore } from '../store/useSettingsStore';

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const surchargesEnabled = useSettingsStore((state) => state.surchargesEnabled);
  const setSurchargesEnabled = useSettingsStore((state) => state.setSurchargesEnabled);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payments</Text>

        <View style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Payment Surcharges</Text>
            <Text style={styles.rowSub}>
              Add 1.5% surcharge for Card and Mobile Payment
            </Text>
          </View>
          <Switch
            value={surchargesEnabled}
            onValueChange={setSurchargesEnabled}
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
  rowInfo: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' as const, color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
});
