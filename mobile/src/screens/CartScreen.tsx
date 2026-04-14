import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  ImageStyle,
  TextInput,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCartStore } from '../store/useCartStore';
import { useLoyaltyStore, LoyaltyCardType } from '../store/useLoyaltyStore';
import { bff } from '../lib/bffClient';
import { Colors, Typography, Spacing, Radius } from '../theme';
import {
  CatalogItem,
  imageSource,
} from '../data/catalog';

// Maps barcode → loyalty card type
const LOYALTY_CARD_MAP: Record<string, LoyaltyCardType> = {
  // Demo short codes
  '7': 'flybuys',
  '8': 'teamMember',
  '9': 'onepass',
  // Full card numbers
  '111122223333': 'flybuys',
  '0430044467': 'flybuys',
  '123412341234': 'flybuys',
  '444455556666': 'teamMember',
  '777788889999': 'onepass',
};

const CARD_LABEL: Record<LoyaltyCardType, string> = {
  flybuys: 'Flybuys',
  teamMember: 'Team Member',
  onepass: 'OnePass',
};

export default function CartScreen({ navigation }: any) {
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.total());
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const addItem = useCartStore((state) => state.addItem);

  const flybuys = useLoyaltyStore((state) => state.flybuys);
  const teamMember = useLoyaltyStore((state) => state.teamMember);
  const onepass = useLoyaltyStore((state) => state.onepass);
  const setCard = useLoyaltyStore((state) => state.setCard);
  const removeCard = useLoyaltyStore((state) => state.removeCard);

  const [searchQuery, setSearchQuery] = useState('');
  const searchQueryRef = useRef('');
  const scanDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadValue, setKeypadValue] = useState('');
  const [loyaltyToast, setLoyaltyToast] = useState<{ type: LoyaltyCardType; replaced: boolean } | null>(null);
  const toastAnim = useRef(new Animated.Value(80)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [discountMap, setDiscountMap] = useState<Record<string, { amount: number; name: string }>>({});
  const [basketDiscount, setBasketDiscount] = useState(0);
  const promoDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-evaluate promotions whenever cart changes
  useEffect(() => {
    if (promoDebounce.current) clearTimeout(promoDebounce.current);
    if (items.length === 0) { setDiscountMap({}); setBasketDiscount(0); return; }
    promoDebounce.current = setTimeout(() => {
      const loyaltyAccountId =
        flybuys?.accountId ?? teamMember?.accountId ?? onepass?.accountId;
      const loyaltyCardType = teamMember ? 'teamMember' : flybuys ? 'flybuys' : onepass ? 'onepass' : undefined;
      bff.post<{ discounts: { cartKey?: string; itemCode: string; discountAmount: number; promotionName: string }[]; basketDiscount: number }>(
        '/api/promotions/evaluate',
        {
          items: items.map((i) => ({ cartKey: i.cartKey, itemCode: i.id, quantity: i.quantity, unitPrice: i.price })),
          ...(loyaltyAccountId ? { loyaltyAccountId } : {}),
          ...(loyaltyCardType ? { loyaltyCardType } : {}),
        },
      ).then((resp) => {
        const map: Record<string, { amount: number; name: string }> = {};
        for (const d of resp.discounts ?? []) {
          const key = d.cartKey ?? d.itemCode;
          map[key] = { amount: d.discountAmount, name: d.promotionName };
        }
        setDiscountMap(map);
        setBasketDiscount(resp.basketDiscount ?? 0);
      }).catch(() => {});
    }, 600);
  }, [items.map((i) => `${i.cartKey}:${i.quantity}`).join(','), flybuys?.accountId, teamMember?.accountId, onepass?.accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDiscount = Object.values(discountMap).reduce((s, d) => s + d.amount, 0) + basketDiscount;

  const handleAddPress = (item: CatalogItem) => {
    addItem({
      id: item.id,
      cartKey: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      image: item.image,
      barcode: item.barcode,
    });
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const triggerLoyalty = (type: LoyaltyCardType, cardNumber: string) => {
    const replaced = setCard(type, cardNumber);
    searchInputRef.current?.focus();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setLoyaltyToast({ type, replaced });
    toastAnim.setValue(80);
    Animated.spring(toastAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 80, duration: 250, useNativeDriver: true }).start(() =>
        setLoyaltyToast(null)
      );
    }, 2500);
  };

  const resolveCode = async (code: string, onNotFound?: () => void) => {
    // Check loyalty cards first
    const cardType = LOYALTY_CARD_MAP[code];
    if (cardType) {
      triggerLoyalty(cardType, code);
      return;
    }

    // Try BFF barcode lookup (covers both short item codes and full barcodes)
    try {
      const resp = await bff.get<{ itemDetails: any[]; totalCount: number }>(
        `/api/catalog/items?barcode=${encodeURIComponent(code)}&pageSize=10`
      );
      const bspItems = resp.itemDetails ?? [];

      // Find exact barcode or item code match
      const match = bspItems.find((i: any) => {
        const itemCode = typeof i.itemCode === 'string' ? i.itemCode : i.itemCode?.value;
        const barcodes: string[] = (i.packageIdentifiers ?? []).map((p: any) => p.value);
        return itemCode === code || barcodes.includes(code);
      });

      if (match) {
        // Fetch price for this item
        const itemCode = typeof match.itemCode === 'string' ? match.itemCode : match.itemCode?.value;
        let price = 0;
        try {
          const priceResp = await bff.post<{ itemPrices: any[] }>('/api/catalog/prices', { itemCodes: [itemCode] });
          const p = priceResp.itemPrices?.[0]?.price;
          price = typeof p === 'number' ? p : (p?.amount ?? 0);
        } catch { /* use $0 if price fetch fails */ }

        const name = typeof match.shortDescription === 'string'
          ? match.shortDescription
          : match.shortDescription?.values?.[0]?.value ?? itemCode;

        handleAddPress({
          id: itemCode,
          name,
          price,
          image: match.imageUrls?.[0],
          barcode: code,
          category: match.departmentId ?? 'General',
        });
        return;
      }
    } catch { /* BFF unreachable */ }

    Alert.alert('Not found', `Code "${code}" not recognised`);
    onNotFound?.();
  };

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
    resolveCode(data);
  };

  const handleKeypadOk = () => {
    const code = keypadValue.trim();
    if (!code) return;
    setKeypadVisible(false);
    setKeypadValue('');
    resolveCode(code);
  };

  const keypadPress = (key: string) => {
    if (key === '⌫') {
      setKeypadValue((v) => v.slice(0, -1));
    } else {
      setKeypadValue((v) => v + key);
    }
  };

  const LOYALTY_CARDS: { type: LoyaltyCardType; account: typeof flybuys; color: string; label: string }[] = [
    { type: 'flybuys',    account: flybuys,     color: '#007AC2', label: 'Flybuys'      },
    { type: 'teamMember', account: teamMember,  color: '#FF6B00', label: 'Team Member'  },
    { type: 'onepass',    account: onepass,     color: '#6B21A8', label: 'OnePass'      },
  ];
  const activeCards = LOYALTY_CARDS.filter((c) => c.account !== null);

  const renderLoyaltyHeader = () => {
    if (activeCards.length === 0) return null;
    return (
      <View style={styles.loyaltyRow}>
        {activeCards.map(({ type, account, color }) => (
          <TouchableOpacity
            key={type}
            style={[styles.loyaltyChip, { backgroundColor: color }]}
            onPress={() => removeCard(type)}
          >
            {type === 'flybuys' ? (
              <Image
                source={require('../../assets/flybuys-logo.png')}
                style={styles.loyaltyChipLogo as ImageStyle}
              />
            ) : (
              <Text style={styles.loyaltyChipText}>{CARD_LABEL[type]}</Text>
            )}
            <Text style={styles.loyaltyChipX}>✕</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Hidden scanner input — always focused, no keyboard, captures wedge scanner keystrokes */}
      <TextInput
        ref={searchInputRef}
        style={styles.hiddenInput}
        value={searchQuery}
        onChangeText={(text) => {
          searchQueryRef.current = text;
          setSearchQuery(text);
          if (scanDebounce.current) clearTimeout(scanDebounce.current);
          scanDebounce.current = setTimeout(() => {
            const code = searchQueryRef.current.trim();
            if (!code) return;
            searchQueryRef.current = '';
            setSearchQuery('');
            void resolveCode(code);
          }, 120);
        }}
        onSubmitEditing={() => {
          if (scanDebounce.current) clearTimeout(scanDebounce.current);
          const code = searchQueryRef.current.trim();
          if (!code) return;
          searchQueryRef.current = '';
          setSearchQuery('');
          void resolveCode(code);
        }}
        returnKeyType="done"
        blurOnSubmit={false}
        autoFocus
        showSoftInputOnFocus={false}
      />

      {/* Cart items */}
      {items.length === 0 && activeCards.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Cart is empty</Text>
          <Text style={styles.emptySubtext}>Scan, search, or use Item Lookup to add items</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.cartKey}
          ListHeaderComponent={renderLoyaltyHeader}
          renderItem={({ item }) => (
            <View style={styles.itemRow}>
              {imageSource(item.image) && (
                <Image source={imageSource(item.image) as any} style={styles.itemImage as ImageStyle} />
              )}
              <View style={styles.itemDetails}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                {(item.size || item.color) && (
                  <View style={styles.attributeRow}>
                    {item.size && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.size}</Text>
                      </View>
                    )}
                    {item.color && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.color}</Text>
                      </View>
                    )}
                  </View>
                )}
                <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                {(discountMap[item.cartKey] ?? discountMap[item.id]) && (
                  <Text style={styles.promoTag}>
                    🏷 {(discountMap[item.cartKey] ?? discountMap[item.id]).name}
                    {'  '}-${(discountMap[item.cartKey] ?? discountMap[item.id]).amount.toFixed(2)}
                  </Text>
                )}
              </View>

              <View style={styles.quantityControl}>
                <TouchableOpacity
                  onPress={() => updateQuantity(item.cartKey, item.quantity - 1)}
                  style={styles.quantityButton}
                >
                  <Text style={styles.quantityButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.quantityText}>{item.quantity}</Text>
                <TouchableOpacity
                  onPress={() => updateQuantity(item.cartKey, item.quantity + 1)}
                  style={styles.quantityButton}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.rightCol}>
                <Text style={styles.lineTotal}>${(item.price * item.quantity).toFixed(2)}</Text>
                <TouchableOpacity onPress={() => removeItem(item.cartKey)} style={styles.deleteButton}>
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Footer — always visible */}
      <View style={styles.footer}>
        {items.length > 0 && totalDiscount > 0 && (
          <View style={styles.savingsRow}>
            <Text style={styles.savingsLabel}>
              {basketDiscount > 0 && Object.keys(discountMap).length === 0
                ? '$5 Off Your Order'
                : 'Promotions Applied'}
            </Text>
            <Text style={styles.savingsAmount}>-${totalDiscount.toFixed(2)}</Text>
          </View>
        )}
        {items.length > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {totalDiscount > 0 ? 'Subtotal (after savings):' : 'Total:'}
            </Text>
            <Text style={styles.totalAmount}>${(total - totalDiscount).toFixed(2)}</Text>
          </View>
        )}
        <View style={styles.footerActions}>
          <TouchableOpacity style={styles.footerIconButton} onPress={handleCameraPress}>
            <Text style={styles.footerIconText}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.footerIconButton, styles.footerIconButtonBlue]} onPress={() => { setKeypadValue(''); setKeypadVisible(true); }}>
            <Text style={styles.footerIconText}>🔢</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.checkoutButton, items.length === 0 && styles.checkoutButtonDisabled]}
            onPress={() => items.length > 0 && navigation.navigate('Checkout')}
            disabled={items.length === 0}
          >
            <Text style={[styles.checkoutButtonText, items.length === 0 && styles.checkoutButtonTextDisabled]}>
              {items.length === 0 ? 'Add item(s) to cart' : 'Proceed to Checkout'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Loyalty toast notification */}
      {loyaltyToast && (
        <Animated.View style={[styles.loyaltyToast, { transform: [{ translateY: toastAnim }], opacity: toastAnim.interpolate({ inputRange: [0, 80], outputRange: [1, 0] }) }]}>
          {loyaltyToast.type === 'flybuys' ? (
            <Image source={require('../../assets/flybuys-logo.png')} style={styles.toastLogo as ImageStyle} />
          ) : (
            <View style={[styles.toastBadge, { backgroundColor: loyaltyToast.type === 'teamMember' ? '#FF6B00' : '#6B21A8' }]}>
              <Text style={styles.toastBadgeText}>{CARD_LABEL[loyaltyToast.type]}</Text>
            </View>
          )}
          <Text style={styles.toastMessage}>
            {CARD_LABEL[loyaltyToast.type]} card {loyaltyToast.replaced ? 'replaced' : 'added'} ✓
          </Text>
        </Animated.View>
      )}

      {/* Keypad modal */}
      <Modal visible={keypadVisible} transparent animationType="slide" onRequestClose={() => setKeypadVisible(false)}>
        <View style={styles.keypadOverlay}>
          <View style={styles.keypadSheet}>
            <Text style={styles.keypadTitle}>Enter Code</Text>
            <View style={styles.keypadDisplay}>
              <Text style={styles.keypadDisplayText}>{keypadValue || ' '}</Text>
            </View>
            <View style={styles.keypadGrid}>
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.keypadKey, key === '' && styles.keypadKeyBlank]}
                  onPress={() => key && keypadPress(key)}
                  disabled={key === ''}
                >
                  <Text style={styles.keypadKeyText}>{key}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.keypadActions}>
              <TouchableOpacity style={styles.keypadCancel} onPress={() => setKeypadVisible(false)}>
                <Text style={styles.keypadCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.keypadOk} onPress={handleKeypadOk}>
                <Text style={styles.keypadOkText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Barcode scanner modal */}
      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'],
            }}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>Align barcode within the frame</Text>
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

  // Hidden scanner input
  hiddenInput: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },

  // Loyalty card strip — single row of chips
  loyaltyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 4,
    justifyContent: 'center',
  },
  loyaltyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 5,
  },
  loyaltyChipLogo: {
    width: 42,
    height: 16,
    resizeMode: 'contain',
  },
  loyaltyChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  loyaltyChipX: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700' as const,
  },


  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { ...Typography.h3, color: Colors.textLight },
  emptySubtext: { ...Typography.body, color: Colors.textLight, marginTop: Spacing.md, textAlign: 'center', paddingHorizontal: Spacing.xl },

  // Cart items
  itemRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginTop: 6,
    borderRadius: Radius.md,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.border,
  },
  itemDetails: { flex: 1 },
  itemName: { fontSize: 12, fontWeight: '600' as const, color: Colors.text, lineHeight: 16 },
  attributeRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  badge: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' as const },
  itemPrice: { ...Typography.caption, color: Colors.textLight, marginTop: 4 },
  promoTag: { fontSize: 11, color: Colors.success, fontWeight: '600' as const, marginTop: 3 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: { color: Colors.background, fontSize: 16, fontWeight: '600' as const },
  quantityText: { ...Typography.body, color: Colors.text, minWidth: 20, textAlign: 'center' },
  rightCol: { alignItems: 'flex-end', gap: 8 },
  lineTotal: { ...Typography.button, color: Colors.primary, minWidth: 56, textAlign: 'right' },
  deleteButton: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: { color: Colors.background, fontSize: 13, fontWeight: '700' as const },

  // Footer
  footer: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  savingsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  savingsLabel: { fontSize: 13, color: Colors.success, fontWeight: '600' as const },
  savingsAmount: { fontSize: 13, color: Colors.success, fontWeight: '700' as const },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  totalLabel: { fontSize: 15, fontWeight: '600' as const, color: Colors.text, flex: 1, paddingRight: Spacing.sm },
  totalAmount: { fontSize: 15, fontWeight: '700' as const, color: Colors.primary, flexShrink: 0 },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  footerIconButton: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerIconButtonBlue: { backgroundColor: Colors.secondary },
  footerIconText: { fontSize: 20 },
  checkoutButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  checkoutButtonDisabled: { backgroundColor: Colors.border },
  checkoutButtonText: { color: Colors.background, fontSize: 15, fontWeight: '700' as const },
  checkoutButtonTextDisabled: { color: Colors.textLight },

  // Loyalty toast
  loyaltyToast: {
    position: 'absolute',
    bottom: 100,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    borderLeftWidth: 4,
    borderLeftColor: Colors.secondary,
  },
  toastLogo: { width: 72, height: 22, resizeMode: 'contain' },
  toastBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  toastBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' as const },
  toastMessage: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: '600' as const },

  // Keypad
  keypadOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  keypadSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  keypadTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  keypadDisplay: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  keypadDisplayText: {
    fontSize: 28,
    fontWeight: '600' as const,
    color: Colors.text,
    letterSpacing: 4,
    minHeight: 40,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  keypadKey: {
    width: '30%',
    height: 56,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadKeyBlank: { backgroundColor: 'transparent' },
  keypadKeyText: { fontSize: 22, fontWeight: '500' as const, color: Colors.text, textAlign: 'center' as const, lineHeight: 28, includeFontPadding: false },
  keypadActions: { flexDirection: 'row', gap: Spacing.md },
  keypadCancel: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  keypadCancelText: { fontSize: 16, fontWeight: '600' as const, color: Colors.textLight },
  keypadOk: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  keypadOkText: { fontSize: 16, fontWeight: '600' as const, color: '#fff' },

  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  scannerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    backgroundColor: 'transparent',
  },
  scannerHint: { color: '#fff', marginTop: Spacing.lg, fontSize: 14, textAlign: 'center' },
  closeButton: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  closeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
});
