export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  /** String URL (remote) or bundled asset number from require(). */
  image?: string | number;
  barcode?: string;
  category: string;
  /** Size label baked into variant items (e.g. 'S', 'M', 'XL') */
  size?: string;
  /** Colour label baked into variant items (e.g. 'Black', 'Navy') */
  color?: string;
}

/** Returns the correct Image source prop for either a remote URL or a local asset. */
export function imageSource(image: string | number | undefined): { uri: string } | number | undefined {
  if (image === undefined || image === null) return undefined;
  if (typeof image === 'number') return image;
  return { uri: image };
}

/**
 * Local product images bundled with the app.
 * Keys are base item IDs — values are the require() result (a number in RN).
 * React Native requires static string literals in require(), so no dynamic paths.
 */
export const LOCAL_IMAGES: Record<string, number> = {
  '1':    require('../../assets/products/1.jpg'),
  '2':    require('../../assets/products/2.jpg'),
  '3':    require('../../assets/products/3.jpg'),
  '4':    require('../../assets/products/4.jpg'),
  '5':    require('../../assets/products/5.jpg'),
  '6':    require('../../assets/products/6.jpg'),
  'e001': require('../../assets/products/e001.jpg'),
  'e002': require('../../assets/products/e002.jpg'),
  'e003': require('../../assets/products/e003.jpg'),
  'e004': require('../../assets/products/e004.jpg'),
  'h001': require('../../assets/products/h001.jpg'),
  'h004': require('../../assets/products/h004.jpg'),
  'h005': require('../../assets/products/h005.jpg'),
  'k002': require('../../assets/products/k002.jpg'),
  'm001': require('../../assets/products/m001.jpg'),
  't001': require('../../assets/products/t001.jpg'),
  'y001': require('../../assets/products/y001.jpg'),
};

/**
 * Returns the base item code for image lookup.
 * Variant codes like 'w001-S-BLK' map to base 'w001' for images.
 */
export function baseItemCode(id: string): string {
  // Variant format: <base>-<SIZE>-<CLR>  (e.g. w001-S-BLK)
  const parts = id.split('-');
  if (parts.length >= 3) return parts[0];
  return id;
}

export const CLOTHING_CATEGORIES = ['Womens', 'Mens', 'Kids & Baby'];

export const CATEGORIES = ['All', 'Womens', 'Mens', 'Kids & Baby', 'Home & Living', 'Tech & Gaming', 'Toys', 'Easter'];

// ── Clothing variant expansion (mirrors bff/src/seed-catalog.ts) ─────────────

const WOMENS_SIZES  = ['XS', 'S', 'M', 'L', 'XL'];
const MENS_SIZES    = ['S', 'M', 'L', 'XL', 'XXL'];
const KIDS_SIZES    = ['2', '4', '6', '8', '10'];

const WOMENS_COLOURS = ['Black', 'White', 'Navy'];
const MENS_COLOURS   = ['Black', 'White', 'Navy'];
const KIDS_COLOURS   = ['Black', 'Pink', 'Blue'];

const CLR_CODE: Record<string, string> = {
  Black: 'BLK', White: 'WHT', Navy: 'NVY',
  Pink: 'PNK', Blue: 'BLU',
};

interface ClothingBase {
  base: string;
  name: string;
  price: number;
  category: string;
  barcodePrefix: string;
  sizes: string[];
  colours: string[];
}

const CLOTHING_BASES: ClothingBase[] = [
  { base: 'w001', name: 'Sleeveless Satin Midi Dress',    price: 28.00, category: 'Womens', barcodePrefix: '93006010', sizes: WOMENS_SIZES, colours: WOMENS_COLOURS },
  { base: 'w002', name: 'Long Sleeve Collared Mini Dress', price: 28.00, category: 'Womens', barcodePrefix: '93006020', sizes: WOMENS_SIZES, colours: WOMENS_COLOURS },
  { base: 'w003', name: 'Long Sleeve Maxi Dress',          price: 30.00, category: 'Womens', barcodePrefix: '93006030', sizes: WOMENS_SIZES, colours: WOMENS_COLOURS },
  { base: 'w004', name: "Women's V-Neck Linen Blend Tee",  price: 14.00, category: 'Womens', barcodePrefix: '93006040', sizes: WOMENS_SIZES, colours: WOMENS_COLOURS },
  { base: 'm001', name: "Men's Regular Fit Crew Tee",  price: 10.00, category: 'Mens', barcodePrefix: '93006110', sizes: MENS_SIZES, colours: MENS_COLOURS },
  { base: 'm002', name: "Men's Slim Fit Chino Pants",  price: 25.00, category: 'Mens', barcodePrefix: '93006120', sizes: MENS_SIZES, colours: MENS_COLOURS },
  { base: 'm003', name: "Men's Fleece Zip Hoodie",     price: 30.00, category: 'Mens', barcodePrefix: '93006130', sizes: MENS_SIZES, colours: MENS_COLOURS },
  { base: 'k001', name: "Kids' Long Sleeve Pyjama Set", price: 16.00, category: 'Kids & Baby', barcodePrefix: '93006210', sizes: KIDS_SIZES, colours: KIDS_COLOURS },
  { base: 'k002', name: "Kids' Stripe PJ Set",          price: 14.00, category: 'Kids & Baby', barcodePrefix: '93006220', sizes: KIDS_SIZES, colours: KIDS_COLOURS },
];

function expandClothing(): CatalogItem[] {
  const items: CatalogItem[] = [];
  for (const base of CLOTHING_BASES) {
    base.sizes.forEach((size, si) => {
      base.colours.forEach((colour, ci) => {
        const clrCode = CLR_CODE[colour] ?? colour.toUpperCase().slice(0, 3);
        const id = `${base.base}-${size}-${clrCode}`;
        const name = `${base.name} - ${size} / ${colour}`;
        const barcode = `${base.barcodePrefix}${String(si).padStart(2, '0')}${String(ci).padStart(2, '0')}`;
        items.push({ id, name, price: base.price, category: base.category, barcode, size, color: colour });
      });
    });
  }
  return items;
}

// ── Full catalog ─────────────────────────────────────────────────────────────

export const CATALOG: CatalogItem[] = [
  // Demo items — short codes 1–6 for quick entry during demos
  { id: '1', name: 'Anko Wireless Earbuds',          price: 29.00, category: 'Tech & Gaming', barcode: '1' },
  { id: '2', name: "Men's Regular Fit Crew Tee",     price: 10.00, category: 'Mens',          barcode: '2' },
  { id: '3', name: 'Ceramic Mug Set of 4',           price: 14.00, category: 'Home & Living', barcode: '3' },
  { id: '4', name: 'Bluey Hollow Easter Egg 40g',    price:  3.00, category: 'Easter',        barcode: '4' },
  { id: '5', name: "Kids' Stripe PJ Set",            price: 14.00, category: 'Kids & Baby',   barcode: '5' },
  { id: '6', name: 'Non-Stick Frypan 28cm',          price: 28.00, category: 'Home & Living', barcode: '6' },
  // Home & Living
  { id: 'h001', name: 'Anko Queen Microfibre Sheet Set', price: 35.00, category: 'Home & Living', barcode: '9300601000031' },
  { id: 'h002', name: 'Anko Standard Pillow 2-Pack',     price: 18.00, category: 'Home & Living', barcode: '9300601000032' },
  { id: 'h003', name: 'Anko Cotton Bath Towel 2-Pack',   price: 22.00, category: 'Home & Living', barcode: '9300601000033' },
  { id: 'h004', name: 'Ceramic Mug Set of 4',            price: 14.00, category: 'Home & Living', barcode: '9300601000034' },
  { id: 'h005', name: 'Non-Stick Frypan 28cm',           price: 28.00, category: 'Home & Living', barcode: '9300601000035' },
  // Tech & Gaming
  { id: 't001', name: 'Anko Wireless Earbuds',   price: 29.00, category: 'Tech & Gaming', barcode: '9300601000041' },
  { id: 't002', name: 'Anko Bluetooth Speaker',  price: 35.00, category: 'Tech & Gaming', barcode: '9300601000042' },
  { id: 't003', name: 'USB-C Charging Cable 2m', price:  9.00, category: 'Tech & Gaming', barcode: '9300601000043' },
  { id: 't004', name: 'Anko 20W Fast Charger',   price: 19.00, category: 'Tech & Gaming', barcode: '9300601000044' },
  // Toys
  { id: 'y001', name: 'Bluey Easter Hunt Pack 125g',     price:  9.00, category: 'Toys', barcode: '9300601000051' },
  { id: 'y002', name: 'Vtech Winnie the Pooh Storybook', price: 22.00, category: 'Toys', barcode: '9300601000052' },
  { id: 'y003', name: 'Kids Art & Craft Set',            price: 15.00, category: 'Toys', barcode: '9300601000053' },
  { id: 'y004', name: 'Foam Dart Blaster',               price: 18.00, category: 'Toys', barcode: '9300601000054' },
  // Easter
  { id: 'e001', name: 'Golden Gaytime Egg 150g',        price: 8.00, category: 'Easter', barcode: '9300601000061' },
  { id: 'e002', name: 'Bluey Milk Chocolate Eggs 100g', price: 5.50, category: 'Easter', barcode: '9300601000062' },
  { id: 'e003', name: 'Nestle Milkybar Egg 72g',        price: 6.00, category: 'Easter', barcode: '9300601000063' },
  { id: 'e004', name: 'Bluey Hollow Easter Egg 40g',    price: 3.00, category: 'Easter', barcode: '9300601000064' },
  // Clothing variants (expanded)
  ...expandClothing(),
];
