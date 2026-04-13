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
  ScrollView,
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
  CATALOG,
  CLOTHING_CATEGORIES,
  SIZES,
  COLORS,
} from '../data/catalog';

// Maps barcode → loyalty card type
const LOYALTY_CARD_MAP: Record<string, LoyaltyCardType> = {
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

  const [searchQuery, setSearchQuery] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadValue, setKeypadValue] = useState('');
  const [loyaltyToast, setLoyaltyToast] = useState<{ type: LoyaltyCardType; replaced: boolean } | null>(null);
  const toastAnim = useRef(new Animated.Value(-100)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [attributeItem, setAttributeItem] = useState<CatalogItem | null>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
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

  const isClothing = (item: CatalogItem) => CLOTHING_CATEGORIES.includes(item.category);

  const handleAddPress = (item: CatalogItem) => {
    if (isClothing(item)) {
      setAttributeItem(item);
      setSelectedSize('');
      setSelectedColor('');
    } else {
      commitAdd(item);
    }
  };

  const commitAdd = (item: CatalogItem, size?: string, color?: string) => {
    const cartKey = size && color ? `${item.id}-${size}-${color}` : item.id;
    addItem({
      id: item.id,
      cartKey,
      name: item.name,
      price: item.price,
      quantity: 1,
      image: item.image,
      barcode: item.barcode,
      size,
      color,
    });
    setSearchQuery('');
  };

  const handleAttributeConfirm = () => {
    if (!attributeItem) return;
    if (!selectedSize) { Alert.alert('Select a size'); return; }
    if (!selectedColor) { Alert.alert('Select a colour'); return; }
    setAttributeItem(null);
    commitAdd(attributeItem, selectedSize, selectedColor);
  };

  const triggerLoyalty = (type: LoyaltyCardType, cardNumber: string) => {
    const replaced = setCard(type, cardNumber);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setLoyaltyToast({ type, replaced });
    toastAnim.setValue(-100);
    Animated.spring(toastAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: -100, duration: 250, useNativeDriver: true }).start(() =>
        setLoyaltyToast(null)
      );
    }, 2500);
  };

  const resolveCode = (code: string, onNotFound?: () => void) => {
    const cardType = LOYALTY_CARD_MAP[code];
    if (cardType) {
      triggerLoyalty(cardType, code);
      return;
    }
    const found = CATALOG.find((item) => item.barcode === code || item.id === code);
    if (found) {
      handleAddPress(found);
    } else {
      Alert.alert('Not found', `Code "${code}" not in catalog`);
      onNotFound?.();
    }
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
    resolveCode(data, () => setScanned(false));
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

  const searchResults = searchQuery.length > 0
    ? CATALOG.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
    : [];

  const sizes = attributeItem ? (SIZES[attributeItem.category] ?? []) : [];

  return (
    <View style={styles.container}>
      {/* Search + Camera + Keypad row */}
      <View style={styles.topBar}>
        <View style={styles.searchInputWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search to add items..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={Colors.textLight}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={handleCameraPress}>
          <Text style={styles.iconButtonText}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconButton, styles.iconButtonBlue]} onPress={() => { setKeypadValue(''); setKeypadVisible(true); }}>
          <Text style={styles.iconButtonText}>🔢</Text>
        </TouchableOpacity>
      </View>

      {/* Loyalty card row */}
      <View style={styles.loyaltyRow}>
        {/* Flybuys */}
        <View style={[styles.loyaltySlot, flybuys ? styles.loyaltySlotActive : styles.loyaltySlotInactive]}>
          {flybuys && (
            <>
              <Image
                source={require('../../assets/flybuys-logo.png')}
                style={styles.flybuysLogo as ImageStyle}
              />
              {flybuys.pointsBalance > 0 && (
                <Text style={styles.loyaltyPoints}>{flybuys.pointsBalance.toLocaleString()} pts</Text>
              )}
            </>
          )}
        </View>

        {/* Team Member */}
        <View style={[styles.loyaltySlot, teamMember ? styles.loyaltySlotActive : styles.loyaltySlotInactive]}>
          {teamMember && (
            <>
              <View style={[styles.loyaltyActiveBadge, { backgroundColor: '#FF6B00' }]}>
                <Text style={styles.loyaltyActiveBadgeText}>TEAM MEMBER</Text>
              </View>
              {teamMember.pointsBalance > 0 && (
                <Text style={styles.loyaltyPoints}>{teamMember.pointsBalance.toLocaleString()} pts</Text>
              )}
            </>
          )}
        </View>

        {/* OnePass */}
        <View style={[styles.loyaltySlot, onepass ? styles.loyaltySlotActive : styles.loyaltySlotInactive]}>
          {onepass && (
            <>
              <View style={[styles.loyaltyActiveBadge, { backgroundColor: '#6B21A8' }]}>
                <Text style={styles.loyaltyActiveBadgeText}>ONEPASS</Text>
              </View>
              {onepass.pointsBalance > 0 && (
                <Text style={styles.loyaltyPoints}>{onepass.pointsBalance.toLocaleString()} pts</Text>
              )}
            </>
          )}
        </View>
      </View>

      {/* Search results overlay */}
      {searchResults.length > 0 && (
        <View style={styles.searchResults}>
          {searchResults.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.searchResultRow}
              onPress={() => handleAddPress(item)}
            >
              {item.image && (
                <Image source={{ uri: item.image }} style={styles.searchResultImage as ImageStyle} />
              )}
              <View style={styles.searchResultInfo}>
                <Text style={styles.searchResultName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.searchResultPrice}>${item.price.toFixed(2)}</Text>
              </View>
              <View style={styles.addBadge}>
                <Text style={styles.addBadgeText}>+ Add</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Cart items */}
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Cart is empty</Text>
          <Text style={styles.emptySubtext}>Scan, search, or use Item Lookup to add items</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.cartKey}
          renderItem={({ item }) => (
            <View style={styles.itemRow}>
              {item.image && (
                <Image source={{ uri: item.image }} style={styles.itemImage as ImageStyle} />
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

      {/* Footer */}
      {items.length > 0 && (
        <View style={styles.footer}>
          {totalDiscount > 0 && (
            <View style={styles.savingsRow}>
              <Text style={styles.savingsLabel}>
                {basketDiscount > 0 && Object.keys(discountMap).length === 0
                  ? '$5 Off Your Order'
                  : 'Promotions Applied'}
              </Text>
              <Text style={styles.savingsAmount}>-${totalDiscount.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {totalDiscount > 0 ? 'Subtotal (after savings):' : 'Total:'}
            </Text>
            <Text style={styles.totalAmount}>${(total - totalDiscount).toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={styles.checkoutButton}
            onPress={() => navigation.navigate('Checkout')}
          >
            <Text style={styles.checkoutButtonText}>Proceed to Checkout</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loyalty toast notification */}
      {loyaltyToast && (
        <Animated.View style={[styles.loyaltyToast, { transform: [{ translateY: toastAnim }] }]}>
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

      {/* Attribute picker modal */}
      <Modal
        visible={!!attributeItem}
        transparent
        animationType="slide"
        onRequestClose={() => setAttributeItem(null)}
      >
        <View style={styles.attrOverlay}>
          <View style={styles.attrSheet}>
            <View style={styles.attrHeader}>
              <Text style={styles.attrTitle} numberOfLines={2}>{attributeItem?.name}</Text>
              <TouchableOpacity onPress={() => setAttributeItem(null)}>
                <Text style={styles.attrClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.attrLabel}>Size</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attrRow}>
              {sizes.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.optionChip, selectedSize === s && styles.optionChipActive]}
                  onPress={() => setSelectedSize(s)}
                >
                  <Text style={[styles.optionText, selectedSize === s && styles.optionTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.attrLabel}>Colour</Text>
            <View style={styles.colorGrid}>
              {COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.optionChip, selectedColor === c && styles.optionChipActive]}
                  onPress={() => setSelectedColor(c)}
                >
                  <Text style={[styles.optionText, selectedColor === c && styles.optionTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.confirmButton} onPress={handleAttributeConfirm}>
              <Text style={styles.confirmButtonText}>Add to Cart</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

  // Top bar
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.text,
  },
  clearButton: { padding: 4 },
  clearButtonText: { fontSize: 14, color: Colors.textLight },
  iconButton: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonBlue: { backgroundColor: Colors.secondary },
  iconButtonText: { fontSize: 20 },

  // Loyalty row
  loyaltyRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  loyaltySlot: {
    flex: 1,
    height: 44,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  loyaltySlotActive: {
    borderColor: Colors.secondary,
    backgroundColor: '#EFF6FF',
  },
  loyaltySlotInactive: {
    borderColor: Colors.border,
    borderStyle: 'dashed' as const,
    backgroundColor: Colors.background,
  },
  loyaltySlotLabel: {
    fontSize: 11,
    color: Colors.textLight,
    fontWeight: '500' as const,
  },
  flybuysLogo: {
    width: '90%',
    height: 28,
    resizeMode: 'contain',
  },
  loyaltyActiveBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  loyaltyActiveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  loyaltyMemberName: {
    fontSize: 10,
    color: Colors.text,
    fontWeight: '600' as const,
    marginTop: 3,
    textAlign: 'center' as const,
  },
  loyaltyPoints: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 1,
    textAlign: 'center' as const,
  },

  // Search results
  searchResults: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxHeight: 280,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchResultImage: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.border,
  },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 13, color: Colors.text, fontWeight: '500' as const },
  searchResultPrice: { fontSize: 12, color: Colors.primary, fontWeight: '600' as const, marginTop: 2 },
  addBadge: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  addBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' as const },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { ...Typography.h3, color: Colors.textLight },
  emptySubtext: { ...Typography.body, color: Colors.textLight, marginTop: Spacing.md, textAlign: 'center', paddingHorizontal: Spacing.xl },

  // Cart items
  itemRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Colors.border,
  },
  itemDetails: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '600' as const, color: Colors.text },
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  savingsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  savingsLabel: { fontSize: 13, color: Colors.success, fontWeight: '600' as const },
  savingsAmount: { fontSize: 13, color: Colors.success, fontWeight: '700' as const },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.lg },
  totalLabel: { fontSize: 16, fontWeight: '600' as const, color: Colors.text, flex: 1, paddingRight: Spacing.sm },
  totalAmount: { fontSize: 16, fontWeight: '700' as const, color: Colors.primary, flexShrink: 0 },
  checkoutButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  checkoutButtonText: { ...Typography.button, color: Colors.background },

  // Loyalty toast
  loyaltyToast: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    zIndex: 999,
  },
  toastLogo: { width: 80, height: 24, resizeMode: 'contain' },
  toastBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  toastBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' as const },
  toastMessage: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' as const },

  // Attribute sheet
  attrOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  attrSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  attrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  attrTitle: { fontSize: 15, fontWeight: '700' as const, color: Colors.text, flex: 1, marginRight: Spacing.md },
  attrClose: { fontSize: 18, color: Colors.textLight },
  attrLabel: { fontSize: 13, fontWeight: '600' as const, color: Colors.textLight, marginBottom: Spacing.sm },
  attrRow: { flexGrow: 0, marginBottom: Spacing.lg },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  optionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  optionChipActive: { borderColor: Colors.primary, backgroundColor: '#FFF0F0' },
  optionText: { fontSize: 13, color: Colors.text },
  optionTextActive: { color: Colors.primary, fontWeight: '600' as const },
  confirmButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },

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
    aspectRatio: 1.6,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadKeyBlank: { backgroundColor: 'transparent' },
  keypadKeyText: { fontSize: 22, fontWeight: '500' as const, color: Colors.text },
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
