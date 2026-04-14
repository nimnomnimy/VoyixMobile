import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useOrderStore, Order, OrderLineItem } from '../store/useOrderStore';
import { bff } from '../lib/bffClient';
import { Colors, Typography, Spacing, Radius } from '../theme';

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  partially_refunded: 'Part Refunded',
  refunded: 'Refunded',
  suspended: 'Suspended',
};

const STATUS_COLOR: Record<string, string> = {
  completed: Colors.success,
  partially_refunded: Colors.warning,
  refunded: Colors.error,
  suspended: Colors.secondary,
};

interface BspOrderLine {
  lineId?: string;
  productId?: { value?: string };
  description?: string;
  quantity?: { value?: number };
  unitPrice?: number;
  fulfillmentResult?: string;
  returnedQuantity?: number;
}

interface BspOrder {
  id?: string;
  orderLines?: BspOrderLine[];
  payments?: { amount?: number }[];
  openDate?: string;
  createdDate?: string;
  refundedTotal?: number;
}

function mapBspOrder(bsp: BspOrder): Order {
  const id = bsp.id ?? '';
  const lines = (bsp.orderLines ?? []).filter((l) => l.fulfillmentResult !== 'Voided');
  const items: OrderLineItem[] = lines.map((l) => ({
    id: l.productId?.value ?? '',
    cartKey: l.lineId ?? l.productId?.value ?? '',
    name: l.description ?? l.productId?.value ?? '',
    price: l.unitPrice ?? 0,
    quantity: l.quantity?.value ?? 1,
    bspLineId: l.lineId,
    refundedQty: l.fulfillmentResult === 'Returned'
      ? (l.quantity?.value ?? 0)
      : l.fulfillmentResult === 'PartialReturn'
        ? (l.returnedQuantity ?? 0)
        : 0,
  }));
  const total = bsp.payments?.[0]?.amount
    ?? items.reduce((s, i) => s + i.price * i.quantity, 0);
  // Use TDM-derived refundedTotal from BFF if available, otherwise derive from line quantities
  const refundedTotal = bsp.refundedTotal
    ?? items.reduce((s, i) => s + i.price * i.refundedQty, 0);
  const allRefunded = items.length > 0 && items.every((i) => i.refundedQty >= i.quantity);
  const anyRefunded = items.some((i) => i.refundedQty > 0);
  return {
    id,
    bspOrderId: id,
    total,
    refundedTotal,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    timestamp: bsp.openDate ?? bsp.createdDate ?? new Date().toLocaleString(),
    status: allRefunded ? 'refunded' : anyRefunded ? 'partially_refunded' : 'completed',
    items,
  };
}

export default function OrdersScreen({ navigation }: any) {
  const orders = useOrderStore((state) => state.orders);
  const syncFromBsp = useOrderStore((state) => state.syncFromBsp);
  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();

  const fetchBspOrders = useCallback(async () => {
    try {
      const data = await bff.get<{ pageContent?: BspOrder[] }>('/api/order/recent');
      const bspOrders = (data?.pageContent ?? []).map(mapBspOrder);
      syncFromBsp(bspOrders);
    } catch {
      // BSP unavailable — show local orders only
    }
  }, [syncFromBsp]);

  useEffect(() => {
    fetchBspOrders().finally(() => setInitialLoading(false));
  }, [fetchBspOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBspOrders();
    setRefreshing(false);
  }, [fetchBspOrders]);

  const filtered = orders.filter((o) =>
    o.id.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCameraPress = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission required', 'Camera access is needed to scan barcodes.');
        return;
      }
    }
    setScanned(false);
    setScannerOpen(true);
  };

  const handleBarcodeScan = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScannerOpen(false);
    const found = orders.find((o) => o.id === data);
    if (found) {
      navigation.navigate('OrderDetail', { orderId: found.id });
    } else {
      Alert.alert('Not found', `No order with code "${data}"`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={16} color={Colors.textLight} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by order code..."
            placeholderTextColor={Colors.textLight}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.cameraButton} onPress={handleCameraPress}>
          <Ionicons name="barcode-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {initialLoading && (
        <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: Spacing.lg }} />
      )}
      <ScrollView
        style={styles.ordersList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {!initialLoading && filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{search ? 'No orders found' : 'No orders yet'}</Text>
            <Text style={styles.emptySubtext}>
              {search ? 'Try a different order code' : 'Completed orders will appear here'}
            </Text>
          </View>
        ) : (
          filtered.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
            >
              <View style={styles.orderHeader}>
                <Text style={styles.orderId} numberOfLines={1}>
                  #{order.id.length > 10 ? order.id.slice(-10) : order.id}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLOR[order.status] }]}>
                  <Text style={styles.statusText}>{STATUS_LABEL[order.status]}</Text>
                </View>
              </View>
              <View style={styles.orderDetails}>
                <View>
                  <Text style={styles.detailLabel}>Items</Text>
                  <Text style={styles.detailValue}>{order.itemCount}</Text>
                </View>
                <View>
                  <Text style={styles.detailLabel}>Total</Text>
                  <Text style={styles.detailValue}>${order.total.toFixed(2)}</Text>
                </View>
                {order.refundedTotal > 0 && (
                  <View>
                    <Text style={styles.detailLabel}>Refunded</Text>
                    <Text style={[styles.detailValue, { color: Colors.error }]}>
                      -${order.refundedTotal.toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={styles.timeContainer}>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.timeValue}>{order.timestamp}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Barcode scanner */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'] }}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>Scan order barcode</Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setScannerOpen(false)}>
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.text,
  },
  clearButton: { padding: 4 },
  cameraButton: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ordersList: { flex: 1, paddingHorizontal: Spacing.md },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { ...Typography.h3, color: Colors.textLight },
  emptySubtext: { ...Typography.body, color: Colors.textLight, marginTop: Spacing.sm },
  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  orderId: { ...Typography.h3, color: Colors.text },
  statusBadge: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.sm },
  statusText: { ...Typography.caption, color: Colors.background, fontWeight: '600' as const },
  orderDetails: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.sm },
  detailLabel: { ...Typography.caption, color: Colors.textLight, marginBottom: Spacing.xs },
  detailValue: { ...Typography.body, color: Colors.text, fontWeight: '600' as const },
  timeContainer: { flex: 1, alignItems: 'flex-end' },
  timeValue: { ...Typography.caption, color: Colors.text },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  scannerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  scannerFrame: {
    width: 260, height: 160,
    borderWidth: 2, borderColor: Colors.primary,
    borderRadius: Radius.md, backgroundColor: 'transparent',
  },
  scannerHint: { color: '#fff', marginTop: Spacing.lg, fontSize: 14, textAlign: 'center' },
  closeButton: {
    marginTop: Spacing.xl, backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.md,
  },
  closeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
});
