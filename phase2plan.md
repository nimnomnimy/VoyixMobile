# VoyixMobile — Phase 2: Full NCR Voyix BSP Integration Plan

## Overview

Phase 2 replaces all local/simulated functionality with live NCR Voyix BSP API calls. The BFF already has routes built for catalog, pricing, cart, and checkout. Phase 2 completes the integration end-to-end and adds loyalty, promotions, returns/refunds, and inventory.

**Guiding principle:** Keep Zustand as the UI state layer for responsiveness. Add a BSP sync layer beneath it. The BFF remains the only service that talks directly to NCR — the mobile app only ever calls the BFF.

---

## Feature 1: Product Catalog

**Status:** BFF route exists (`GET /api/catalog/items`, `GET /api/catalog/items/:code`). Mobile uses hardcoded `CATALOG` array.

### BFF changes
- None required. Route already normalises BSP `pageContent` → `itemDetails`.
- Consider adding pagination support (BFF already passes `pageNumber`/`lastPage`).

### Mobile changes

**`data/catalog.ts`**
- Keep the hardcoded `CATALOG` as a fallback/offline cache only.
- Add `fetchCatalogItems(query?, category?, pageSize?)` async function that calls `GET /api/catalog/items`.

**`screens/ScanScreen.tsx`**
- Replace static `CATALOG.filter(...)` with a `useEffect` that calls the BFF on mount and on search query changes (debounced 300ms).
- Show a loading spinner while fetching.
- Map BSP `itemDetails` response fields to `CatalogItem`: `itemCode` → `id`, `shortDescription` → `name`, `departmentId` → `category`.
- If BFF returns empty or errors, fall back to the hardcoded catalog with a toast warning.

**`screens/CartScreen.tsx`**
- Same search-as-you-type flow — calls BFF instead of filtering local array.

---

## Feature 2: Pricing (Real-time)

**Status:** BFF route exists (`POST /api/catalog/prices`). Mobile uses hardcoded prices in the catalog array.

### BFF changes
- None required.

### Mobile changes
- After fetching catalog items from BSP (Feature 1), batch-fetch prices with `POST /api/catalog/prices` using the returned `itemCode` list.
- Merge prices into the displayed items before rendering. BSP price response maps `itemCode` → `unitPrice`.
- Display BSP price if available, fall back to hardcoded price if not.

---

## Feature 3: Cart / Transaction (Server-Side)

**Status:** BFF has full cart CRUD (`POST /api/cart/create`, `POST /api/cart/:id/lines`, `DELETE /api/cart/:id/lines/:lineId`, `DELETE /api/cart/:id`). Mobile uses Zustand local state only.

### BFF changes
- Verify the `PATCH` endpoint for updating line item quantity (currently only add/void). Add a `PUT /api/cart/:id/lines/:lineId` that patches a line's quantity directly.
- Add `GET /api/cart/:id` response normalisation to match `CartItem` shape for mobile.

### Mobile changes

**`store/useCartStore.ts`**
- Add `bspOrderId: string | null` to state.
- On `addItem`: if `bspOrderId` is null, call `POST /api/cart/create` first to get an order ID, then call `POST /api/cart/:id/lines`. If order already exists, go straight to `POST /api/cart/:id/lines`.
- On `removeItem`: call `DELETE /api/cart/:id/lines/:lineId` (need to store BSP `lineId` on each `CartItem`).
- On `updateQuantity`: call `POST /api/cart/:id/lines` with updated quantity (BSP PATCH merges).
- On `clearCart`: call `DELETE /api/cart/:id` (cancel the order) and reset `bspOrderId`.
- On `suspendOrder` (RootNavigator): do NOT cancel the BSP order — leave it in `Open` status. Save the BSP order ID with the suspended record so it can be resumed.
- All BSP calls are fire-and-forget (optimistic UI) — Zustand state updates immediately, BSP sync happens async with error logging.

**`store/useCartStore.ts` — `CartItem` type**
- Add `bspLineId?: string` field to store the BSP line ID returned by the cart line create response.

---

## Feature 4: Checkout / Payment

**Status:** BFF route exists (`POST /api/order/checkout`) and submits a TDM t-log. Mobile simulates checkout with `setTimeout`.

### BFF changes
- None required. Checkout route already sequences: fetch order → PATCH to OrderPlaced with payment → POST t-log to TDM.
- Consider adding a `loyaltyCardNumber` field to checkout body to record loyalty on the t-log.

### Mobile changes

**`screens/CheckoutScreen.tsx`**
- Replace the `setTimeout` simulation with a real `POST /api/order/checkout` call.
- Pass `orderId` (the `bspOrderId` from useCartStore), `paymentType`, `paymentAmount`, and `staffId` (from useAuthStore).
- On success: clear cart (which cancels the BSP order — need to NOT cancel since it's already OrderPlaced, so add a `clearCartLocal()` action that skips the BSP DELETE).
- Show a real confirmation with the BSP `orderId` and `tlogId` returned.
- On failure: show the error message and keep the cart intact so the cashier can retry.

**`store/useOrderStore.ts`**
- Store `bspOrderId` on completed orders so `OrderDetailScreen` can fetch live data from BSP.

---

## Feature 5: Order History

**Status:** BFF has `GET /api/order/recent` and `GET /api/order/:id`. Mobile stores orders in local Zustand (lost on app restart).

### BFF changes
- None required.
- Optional: add filtering by date range or status to `GET /api/order/recent`.

### Mobile changes

**`screens/OrdersScreen.tsx`**
- On mount, call `GET /api/order/recent` to fetch the last 50 orders from BSP.
- Merge with local suspended orders (which are not on BSP yet in this phase).
- Map BSP order fields to the local `Order` type: `id`, `status`, `orderLines` → `items`, `payments[0].amount` → `total`.
- Add pull-to-refresh.

**`screens/OrderDetailScreen.tsx`**
- If the order has a `bspOrderId`, fetch live detail from `GET /api/order/:id`.
- Display BSP order lines, status, and payment info instead of (or alongside) local state.

**`store/useOrderStore.ts`**
- Add `syncFromBsp(orders: BspOrder[])` action to merge BSP-fetched orders into local state.
- Keep suspended orders local-only until resumed and checked out.

---

## Feature 6: Returns / Refunds

**Status:** Refund is local state only. BSP Order API supports voiding lines; TDM supports return t-logs.

### BFF changes

Add `POST /api/order/:id/refund` route:
```
Body: { lines: [{ lineId, quantity }], staffId, paymentType }
Steps:
  1. Fetch current order from BSP
  2. PATCH each line: set fulfillmentResult = 'Returned', adjust quantity
  3. PATCH order status to 'PartialReturn' or 'Returned'
  4. POST return t-log to TDM (isReturn: true on affected lines, transactionType: 'RETURN')
  5. Return updated order
```

### Mobile changes

**`screens/OrderDetailScreen.tsx`**
- Replace the local `refundItems` Zustand action call with a `POST /api/order/:id/refund` call.
- Show a loading state during the refund.
- On success: update the local order state with BSP response (status, refunded quantities).
- On failure: show error, keep original state.

---

## Feature 7: Loyalty (Flybuys / Team Member / OnePass)

**Status:** Card barcodes are recognised locally. No BSP validation, no points, no balance.

### BFF changes

Add `POST /api/loyalty/identify` route:
```
Body: { cardNumber, cardType: 'flybuys' | 'teamMember' | 'onepass' }
BSP path: POST /customer/1/loyalty-accounts/identify  (or equivalent)
Returns: { accountId, memberName, pointsBalance, tier }
```

Add `POST /api/loyalty/accrue` route (called at checkout):
```
Body: { accountId, orderId, totalAmount }
BSP path: POST /customer/1/loyalty-events
Returns: { pointsEarned, newBalance }
```

### Mobile changes

**`store/useLoyaltyStore.ts`**
- Add `accountId: string | null`, `memberName: string | null`, `pointsBalance: number | null` per card type.
- `setCard()` after storing the card number, calls `POST /api/loyalty/identify` and stores the returned account details.
- Show member name and points balance in the loyalty card row on CartScreen (below the logo when active).

**`screens/CartScreen.tsx`**
- When a loyalty card slot is active, show `memberName` and `pointsBalance` under the logo/badge.

**`screens/CheckoutScreen.tsx`**
- After successful checkout, call `POST /api/loyalty/accrue` for each active loyalty card.
- Show points earned in the `OrderConfirmationScreen`.

---

## Feature 8: Promotions / Discounts

**Status:** Not implemented. BSP has a Promotions Engine.

### BFF changes

Add `POST /api/promotions/evaluate` route:
```
Body: { orderId, itemCodes: string[], loyaltyAccountId?: string }
BSP path: POST /promotion/4/promotions/evaluate  (or similar)
Returns: { discounts: [{ itemCode, discountAmount, promotionName }], basketDiscount }
```

### Mobile changes

**`store/useCartStore.ts`**
- Add `promotions: Promotion[]` and `basketDiscount: number` to state.
- After any `addItem`/`removeItem`/`updateQuantity`, call `POST /api/promotions/evaluate` (debounced 500ms) and store results.

**`screens/CartScreen.tsx`**
- Display promotion discounts inline on relevant cart items (e.g., "Save $2.00 — 2 for $20").
- Show basket-level discount in the footer totals row.
- Update displayed total to reflect discounts before checkout.

**`screens/CheckoutScreen.tsx`**
- Pass promotion discount details into the checkout body and t-log.

---

## Feature 9: Inventory

**Status:** Not implemented. BSP has an Inventory API.

### BFF changes

Add `GET /api/inventory/:itemCode` route:
```
BSP path: GET /inventory/1/inventory-documents/:siteId/:itemCode
Returns: { itemCode, quantityOnHand, quantityAvailable, lowStockThreshold }
```

Add `POST /api/inventory/batch` route:
```
Body: { itemCodes: string[] }
Returns: { [itemCode]: { quantityAvailable, isLowStock, isOutOfStock } }
```

### Mobile changes

**`screens/ScanScreen.tsx`** (Item Lookup)
- After fetching catalog items, batch-call `POST /api/inventory/batch`.
- Show stock indicators on each catalog item card: green dot (in stock), orange dot (low stock), grey "Out of stock" badge.
- Prevent adding out-of-stock items to cart (or show a warning alert).

**`screens/CartScreen.tsx`**
- When a barcode is scanned or item is added, check inventory for that item code.
- If out of stock, show an alert: "This item is out of stock — add anyway?"

---

## Implementation Order

| Priority | Feature | Reason |
|----------|---------|--------|
| 1 | **Catalog** (Feature 1) | Unblocks all other features; removes hardcoded data |
| 2 | **Pricing** (Feature 2) | Trivial once catalog is live |
| 3 | **Cart sync** (Feature 3) | Core POS flow; needed for real checkout |
| 4 | **Checkout** (Feature 4) | Completes the transaction loop with real TDM t-log |
| 5 | **Order History** (Feature 5) | Orders persist across restarts |
| 6 | **Returns** (Feature 6) | Completes the order management flow |
| 7 | **Loyalty** (Feature 7) | High business value; validate cards and earn points |
| 8 | **Promotions** (Feature 8) | Requires cart sync to be working |
| 9 | **Inventory** (Feature 9) | Enriches UX; prevents overselling |

---

## Shared Infrastructure Needed

### Auth token forwarding
All mobile BFF calls need to include `Authorization: Bearer <token>` from `expo-secure-store`. Create a shared `bffFetch(path, options)` helper in `src/lib/bffClient.ts` that:
- Reads the token from SecureStore (or useAuthStore)
- Adds `Authorization` and `Bypass-Tunnel-Reminder` headers automatically
- Points to `EXPO_PUBLIC_BFF_URL`
- Throws a typed `BffError` on non-OK responses

### BFF auth middleware
Add JWT verification middleware to all BFF routes (currently only the log route is unprotected by design). The mobile JWT issued by `POST /api/auth/login` should be verified on every protected route using `@fastify/jwt`.

### Error handling
- BFF: all BSP errors already pass through `assertOk` → `BspError` → global error handler. Add structured error codes (e.g., `BSP_CATALOG_UNAVAILABLE`) so the mobile can distinguish "BSP down" from "item not found".
- Mobile: display user-friendly messages per error code. Never expose raw BSP errors to the cashier UI.

### Environment
- Add `EXPO_PUBLIC_USE_LOCAL_CATALOG=true` env flag to fall back to hardcoded catalog when BSP catalog is unavailable (useful for demos without network).
