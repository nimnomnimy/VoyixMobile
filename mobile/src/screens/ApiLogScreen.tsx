import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { storage } from '../lib/storage';
import { showAlert } from '../lib/webAlert';

const BFF = process.env.EXPO_PUBLIC_BFF_URL || 'http://localhost:8765';

type LogEntry = {
  id: number;
  timestamp: string;
  service: string;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
  ok: boolean;
  error?: string;
};

// ─── BSP coverage — derived from live API log entries ────────────────────────

type CoverageStatus = 'live' | 'partial' | 'error' | 'untested';

interface FeatureDef {
  feature: string;
  bspService: string;
  /** Substring matched against BSP path in log entries. null = no BSP calls (static status). */
  matchPath: string | null;
  staticStatus?: CoverageStatus;
  note: string;
}

const FEATURE_DEFS: FeatureDef[] = [
  {
    feature: 'Product Catalog',
    bspService: 'Catalog API',
    matchPath: '/catalog/v2/item-details',
    note: 'GET /api/catalog/items — item search and barcode lookup. Local catalog only shown when BFF is unreachable.',
  },
  {
    feature: 'Pricing',
    bspService: 'Price Engine API',
    matchPath: '/catalog/v2/item-prices',
    note: 'POST /api/catalog/prices — batch price fetch after each catalog search.',
  },
  {
    feature: 'Cart',
    bspService: 'Order Management API',
    matchPath: '/order/3/orders/1',
    note: 'Cart synced to BSP on every add/remove/quantity change via Open order lifecycle.',
  },
  {
    feature: 'Checkout / Payment',
    bspService: 'Order Management + TDM',
    matchPath: '/transaction-document',
    note: 'POST /api/order/checkout finalises the BSP order and submits a TDM t-log.',
  },
  {
    feature: 'Order History',
    bspService: 'Order Management API',
    matchPath: '/find',
    note: 'Orders screen fetches last 50 orders from BSP on mount and pull-to-refresh.',
  },
  {
    feature: 'Returns / Refunds',
    bspService: 'Order Management API',
    matchPath: null,
    staticStatus: 'partial',
    note: 'POST /api/order/:id/refund marks lines as Returned and submits a return t-log. Status shown after a return is performed.',
  },
  {
    feature: 'Site Info',
    bspService: 'Sites API',
    matchPath: '/sites/',
    note: 'GET /api/sites/current — site configuration fetched on BFF startup.',
  },
  {
    feature: 'Loyalty',
    bspService: 'Loyalty API',
    matchPath: '/loyalty/',
    note: 'Card scan identifies member via POST /api/loyalty/identify. Points accrued via POST /api/loyalty/accrue after checkout.',
  },
  {
    feature: 'Staff Authentication',
    bspService: 'Local JWT',
    matchPath: null,
    staticStatus: 'partial',
    note: 'JWT issued locally with demo staff IDs (1001, 1002, 9001). NCR IAM not integrated — any PIN ≥ 4 digits is accepted.',
  },
];

function deriveStatus(def: FeatureDef, entries: LogEntry[]): CoverageStatus {
  if (def.staticStatus) return def.staticStatus;
  if (!def.matchPath) return 'untested';
  const matching = entries.filter((e) => e.path.includes(def.matchPath!));
  if (matching.length === 0) return 'untested';
  if (matching.some((e) => e.ok)) return 'live';
  return 'error';
}

const STATUS_COLOR: Record<CoverageStatus, string> = {
  live:     Colors.success,
  partial:  Colors.warning,
  error:    Colors.error,
  untested: '#aaa',
};

const STATUS_LABEL: Record<CoverageStatus, string> = {
  live:     'Live',
  partial:  'Partial',
  error:    'Error',
  untested: 'Not tested',
};

export default function ApiLogScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'log' | 'coverage'>('log');

  const fetchLog = useCallback(async () => {
    try {
      const token = await storage.getItem('authToken');
      const res = await fetch(`${BFF}/api/log`, {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();
      setEntries(json.entries ?? []);
    } catch {
      // BFF unreachable
    }
  }, []);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLog();
    setRefreshing(false);
  };

  const handleClear = () => {
    showAlert('Clear Log', 'Remove all API log entries?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await fetch(`${BFF}/api/log`, { method: 'DELETE' });
          setEntries([]);
        },
      },
    ]);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BSP API Log</Text>
        {tab === 'log' && (
          <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'log' && styles.tabActive]}
          onPress={() => setTab('log')}
        >
          <Text style={[styles.tabText, tab === 'log' && styles.tabTextActive]}>API Calls</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'coverage' && styles.tabActive]}
          onPress={() => setTab('coverage')}
        >
          <Text style={[styles.tabText, tab === 'coverage' && styles.tabTextActive]}>BSP Coverage</Text>
        </TouchableOpacity>
      </View>

      {tab === 'log' ? (
        <ScrollView
          style={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
        >
          {entries.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No BSP API calls recorded yet</Text>
              <Text style={styles.emptySubtext}>Calls appear here as features use BSP services</Text>
            </View>
          ) : (
            entries.map((entry) => (
              <View key={entry.id} style={[styles.entryCard, !entry.ok && entry.statusCode !== null && styles.entryError]}>
                <View style={styles.entryTop}>
                  <View style={[styles.methodBadge, { backgroundColor: entry.method === 'GET' ? Colors.secondary : Colors.primary }]}>
                    <Text style={styles.methodText}>{entry.method}</Text>
                  </View>
                  <Text style={styles.serviceName}>{entry.service}</Text>
                  <Text style={styles.entryTime}>{formatTime(entry.timestamp)}</Text>
                </View>
                <Text style={styles.entryPath}>{entry.path}</Text>
                <View style={styles.entryBottom}>
                  {entry.statusCode !== null ? (
                    <Text style={[styles.statusCode, { color: entry.ok ? Colors.success : Colors.error }]}>
                      HTTP {entry.statusCode}
                    </Text>
                  ) : (
                    <Text style={styles.statusCode}>In flight…</Text>
                  )}
                  {entry.durationMs !== null && (
                    <Text style={styles.duration}>{entry.durationMs}ms</Text>
                  )}
                  {entry.error && (
                    <Text style={styles.errorText} numberOfLines={1}>{entry.error}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll}>
          <Text style={styles.coverageIntro}>
            Live status derived from API calls made this session. Use the app to generate calls, then check back here.
          </Text>
          {FEATURE_DEFS.map((def) => {
            const status = deriveStatus(def, entries);
            return (
              <View key={def.feature} style={styles.coverageCard}>
                <View style={styles.coverageHeader}>
                  <Text style={styles.coverageFeature}>{def.feature}</Text>
                  <View style={[styles.coverageBadge, { backgroundColor: STATUS_COLOR[status] }]}>
                    <Text style={styles.coverageBadgeText}>{STATUS_LABEL[status]}</Text>
                  </View>
                </View>
                <Text style={styles.coverageService}>{def.bspService}</Text>
                <Text style={styles.coverageNote}>{def.note}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}
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
  clearButton: { padding: 4 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '500' as const, color: Colors.textLight },
  tabTextActive: { color: Colors.primary, fontWeight: '700' as const },

  scroll: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.md },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { ...Typography.h3, color: Colors.textLight },
  emptySubtext: { ...Typography.body, color: Colors.textLight, marginTop: Spacing.sm, textAlign: 'center' },

  entryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  entryError: { borderLeftWidth: 3, borderLeftColor: Colors.error },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  methodBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodText: { color: '#fff', fontSize: 10, fontWeight: '700' as const },
  serviceName: { flex: 1, fontSize: 13, fontWeight: '600' as const, color: Colors.text },
  entryTime: { fontSize: 11, color: Colors.textLight },
  entryPath: { fontSize: 11, color: Colors.textLight, fontFamily: 'monospace', marginBottom: 6 },
  entryBottom: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  statusCode: { fontSize: 12, fontWeight: '700' as const },
  duration: { fontSize: 12, color: Colors.textLight },
  errorText: { fontSize: 11, color: Colors.error, flex: 1 },

  coverageIntro: {
    ...Typography.body,
    color: Colors.textLight,
    marginBottom: Spacing.md,
    fontStyle: 'italic',
  },
  coverageCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  coverageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  coverageFeature: { fontSize: 14, fontWeight: '700' as const, color: Colors.text, flex: 1, marginRight: Spacing.sm },
  coverageBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  coverageBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' as const },
  coverageService: { fontSize: 12, color: Colors.secondary, fontWeight: '600' as const, marginBottom: 4 },
  coverageNote: { fontSize: 12, color: Colors.textLight, lineHeight: 18 },
});
