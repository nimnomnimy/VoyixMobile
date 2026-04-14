import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Image,
  ImageStyle,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { showAlert } from '../lib/webAlert';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '../store/useCartStore';
import { useLoyaltyStore, LoyaltyCardType } from '../store/useLoyaltyStore';
import { Colors, Spacing, Radius } from '../theme';
import {
  CatalogItem,
  CATEGORIES,
  CLOTHING_CATEGORIES,
  SIZES,
  COLORS,
  imageSource,
} from '../data/catalog';
import { useCatalog } from '../hooks/useCatalog';
import { bff } from '../lib/bffClient';

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

export default function ScanScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [loyaltyVisible, setLoyaltyVisible] = useState(false);
  const [loyaltyType, setLoyaltyType] = useState<LoyaltyCardType>('flybuys');
  const [loyaltyReplaced, setLoyaltyReplaced] = useState(false);
  const [attributeItem, setAttributeItem] = useState<CatalogItem | null>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [keypadVisible, setKeypadVisible] = useState(false);
  const [keypadValue, setKeypadValue] = useState('');
  const [stockMap, setStockMap] = useState<Record<string, { isOutOfStock: boolean; isLowStock: boolean }>>({});
  const [permission, requestPermission] = useCameraPermissions();
  const [toastName, setToastName] = useState('');
  const [toastVariant, setToastVariant] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastSlide  = useRef(new Animated.Value(16)).current;
  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addItem = useCartStore((state) => state.addItem);
  const setCard = useLoyaltyStore((state) => state.setCard);

  const showToast = (name: string, variant?: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastName(name);
    setToastVariant(variant ?? '');
    toastOpacity.setValue(0);
    toastSlide.setValue(16);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(toastSlide,   { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
      ]),
      Animated.delay(2000),
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(toastSlide,   { toValue: 16, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ]).start();
    toastTimer.current = setTimeout(() => { setToastName(''); setToastVariant(''); }, 2600);
  };

  const { items: filteredItems, loading: catalogLoading, error: catalogError, retry: retryFetch } = useCatalog(searchQuery, selectedCategory);

  // Batch fetch inventory when catalog items change
  useEffect(() => {
    if (filteredItems.length === 0) return;
    const codes = filteredItems.map((i) => i.id).filter(Boolean);
    void bff.post<Record<string, { isOutOfStock: boolean; isLowStock: boolean }>>(
      '/api/inventory/batch', { itemCodes: codes }
    ).then(setStockMap).catch(() => {});
  }, [filteredItems.map((i) => i.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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
    showToast(item.name, size && color ? `${size} · ${color}` : undefined);
  };

  const handleAttributeConfirm = () => {
    if (!attributeItem) return;
    if (!selectedSize) { showAlert('Select a size'); return; }
    if (!selectedColor) { showAlert('Select a colour'); return; }
    setAttributeItem(null);
    commitAdd(attributeItem, selectedSize, selectedColor);
  };

  const handleCameraPress = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showAlert('Permission required', 'Camera access is needed to scan barcodes.');
        return;
      }
    }
    setScanned(false);
    setScannerOpen(true);
  };

  const triggerLoyalty = (type: LoyaltyCardType, cardNumber: string) => {
    const replaced = setCard(type, cardNumber);
    setLoyaltyType(type);
    setLoyaltyReplaced(replaced);
    setLoyaltyVisible(true);
    setTimeout(() => setLoyaltyVisible(false), 3000);
  };

  const resolveCode = async (code: string, onNotFound?: () => void) => {
    const cardType = LOYALTY_CARD_MAP[code];
    if (cardType) {
      triggerLoyalty(cardType, code);
      return;
    }
    try {
      const resp = await bff.get<{ itemDetails: any[]; totalCount: number }>(
        `/api/catalog/items?barcode=${encodeURIComponent(code)}&pageSize=10`
      );
      const bspItems = resp.itemDetails ?? [];
      const match = bspItems.find((i: any) => {
        const itemCode = typeof i.itemCode === 'string' ? i.itemCode : i.itemCode?.value;
        const barcodes: string[] = (i.packageIdentifiers ?? []).map((p: any) => p.value);
        return itemCode === code || barcodes.includes(code);
      });
      if (match) {
        const itemCode = typeof match.itemCode === 'string' ? match.itemCode : match.itemCode?.value ?? code;
        const name = typeof match.shortDescription === 'string'
          ? match.shortDescription
          : (match.shortDescription?.values?.[0]?.value ?? itemCode);
        let price = 0;
        try {
          const priceResp = await bff.post<{ itemPrices?: any[] }>('/api/catalog/prices', { itemCodes: [itemCode] });
          const entry = priceResp.itemPrices?.[0];
          if (entry) price = typeof entry.price === 'number' ? entry.price : (entry.price?.amount ?? entry.unitPrice ?? 0);
        } catch { /* price unavailable */ }
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
    showAlert('Not found', `Code "${code}" not in catalog`);
    onNotFound?.();
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

  const sizes = attributeItem ? (SIZES[attributeItem.category] ?? []) : [];

  return (
    <View style={styles.container}>
      {/* Search + Camera */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search or scan barcode..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={() => { /* debounce fires automatically via useEffect */ }}
            placeholderTextColor={Colors.textLight}
            returnKeyType="search"
            blurOnSubmit={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {Platform.OS !== 'web' && (
          <TouchableOpacity style={styles.cameraButton} onPress={handleCameraPress}>
            <Text style={styles.cameraButtonText}>📷</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.keypadButton} onPress={() => { setKeypadValue(''); setKeypadVisible(true); }}>
          <Text style={styles.cameraButtonText}>🔢</Text>
        </TouchableOpacity>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Product list */}
      {catalogLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading catalog…</Text>
        </View>
      ) : catalogError ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textLight} />
          <Text style={styles.errorText}>Cannot connect to catalog</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retryFetch}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
          {filteredItems.map((item) => {
            const stock = stockMap[item.id];
            const outOfStock = stock?.isOutOfStock ?? false;
            const lowStock   = stock?.isLowStock   ?? false;
            return (
              <View key={item.id} style={[styles.itemCard, outOfStock && styles.itemCardDimmed]}>
                {imageSource(item.image) && (
                  <Image source={imageSource(item.image) as any} style={styles.itemImage as ImageStyle} />
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.itemPrice}>${item.price.toFixed(2)}</Text>
                  {isClothing(item) && (
                    <Text style={styles.attributeHint}>Select size & colour</Text>
                  )}
                  {outOfStock && <Text style={styles.outOfStockLabel}>Out of stock</Text>}
                  {lowStock   && !outOfStock && <Text style={styles.lowStockLabel}>Low stock</Text>}
                </View>
                <TouchableOpacity
                  style={[styles.addButton, outOfStock && styles.addButtonDisabled]}
                  onPress={() => {
                    if (outOfStock) {
                      showAlert('Out of Stock', `${item.name} is out of stock. Add anyway?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Add Anyway', onPress: () => handleAddPress(item) },
                      ]);
                    } else {
                      handleAddPress(item);
                    }
                  }}
                >
                  <Text style={styles.addButtonText}>{outOfStock ? 'OOS' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
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

      {/* Manual code entry keypad */}
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

      {/* Loyalty card modal */}
      <Modal visible={loyaltyVisible} transparent animationType="fade" onRequestClose={() => setLoyaltyVisible(false)}>
        <View style={styles.loyaltyOverlay}>
          <View style={styles.loyaltyCard}>
            {loyaltyType === 'flybuys' ? (
              <Image
                source={require('../../assets/flybuys-logo.png')}
                style={styles.flybuysLogoImage as ImageStyle}
              />
            ) : (
              <View style={[styles.cardTypeBadge, { backgroundColor: loyaltyType === 'teamMember' ? '#FF6B00' : '#6B21A8' }]}>
                <Text style={styles.cardTypeBadgeText}>{CARD_LABEL[loyaltyType]}</Text>
              </View>
            )}
            <Text style={styles.loyaltyMessage}>
              {CARD_LABEL[loyaltyType]} card {loyaltyReplaced ? 'replaced' : 'added'}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Barcode scanner modal — native only */}
      <Modal visible={Platform.OS !== 'web' && scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
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

      {/* Add-to-cart speech bubble — points toward the Cart tab (bottom-left) */}
      {toastName !== '' && (
        <Animated.View
          style={[styles.toastWrap, { opacity: toastOpacity, transform: [{ translateY: toastSlide }] }]}
          pointerEvents="none"
        >
          <View style={styles.toastBubble}>
            <View style={styles.toastIconWrap}>
              <Ionicons name="cart" size={18} color={Colors.primary} />
            </View>
            <View style={styles.toastTextWrap}>
              <Text style={styles.toastTitle}>Added to Cart</Text>
              <Text style={styles.toastName} numberOfLines={1}>{toastName}</Text>
              {toastVariant !== '' && (
                <Text style={styles.toastVariant}>{toastVariant}</Text>
              )}
            </View>
          </View>
          {/* Arrow pointing down toward Cart tab */}
          <View style={styles.toastArrowBorder} />
          <View style={styles.toastArrow} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: Spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    fontSize: 14,
  },
  clearButton: { padding: 4 },
  clearButtonText: { fontSize: 14, color: Colors.textLight },
  cameraButton: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadButton: {
    backgroundColor: Colors.secondary,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraButtonText: { fontSize: 20 },
  categoryScroll: { flexGrow: 0, marginBottom: Spacing.sm },
  categoryContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm },
  categoryChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  categoryChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryText: { fontSize: 13, color: Colors.text, fontWeight: '500' as const },
  categoryTextActive: { color: '#fff', fontWeight: '600' as const },
  itemsList: { flex: 1, paddingHorizontal: Spacing.md },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemImage: { width: 64, height: 64, borderRadius: Radius.sm, backgroundColor: Colors.border },
  itemCardDimmed: { opacity: 0.5 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '600' as const, color: Colors.text },
  itemPrice: { fontSize: 13, color: Colors.primary, fontWeight: '700' as const, marginTop: 4 },
  attributeHint: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  outOfStockLabel: { fontSize: 11, color: Colors.error, fontWeight: '600' as const, marginTop: 2 },
  lowStockLabel: { fontSize: 11, color: Colors.warning, fontWeight: '600' as const, marginTop: 2 },
  addButton: {
    backgroundColor: Colors.secondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  addButtonDisabled: { backgroundColor: Colors.textLight },
  addButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' as const },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  loadingText: { fontSize: 14, color: Colors.textLight },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  errorText: { fontSize: 16, color: Colors.textLight, textAlign: 'center' as const },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  retryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' as const },

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

  // Loyalty
  loyaltyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loyaltyCard: {
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    width: 280,
    gap: Spacing.lg,
  },
  flybuysLogoImage: { width: 200, height: 60, resizeMode: 'contain' },
  cardTypeBadge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  cardTypeBadgeText: { color: '#fff', fontSize: 18, fontWeight: '700' as const },
  loyaltyMessage: { fontSize: 18, fontWeight: '600' as const, color: Colors.text },

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
  keypadKeyBlank: {
    backgroundColor: 'transparent',
  },
  keypadKeyText: {
    fontSize: 22,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  keypadActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  keypadCancel: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  keypadCancelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.textLight,
  },
  keypadOk: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  keypadOkText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  // Speech-bubble toast — anchored bottom-left, arrow points to Cart tab
  toastWrap: {
    position: 'absolute',
    bottom: 60,   // sits just above the tab bar
    left: Spacing.sm,
    right: '30%', // doesn't stretch full width — leaves room near Cart tab
  },
  toastBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  toastIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  toastTextWrap: { flex: 1 },
  toastTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.primary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  toastName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  toastVariant: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 1,
  },
  // Downward-pointing arrow — border layer (outline)
  toastArrowBorder: {
    position: 'absolute',
    bottom: -10,
    left: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.border,
  },
  // Downward-pointing arrow — fill layer
  toastArrow: {
    position: 'absolute',
    bottom: -8,
    left: 21,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.surface,
  },
});
