export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  barcode?: string;
  category: string;
}

export const CLOTHING_CATEGORIES = ['Womens', 'Mens', 'Kids & Baby'];

export const SIZES: Record<string, string[]> = {
  Womens: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  Mens: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'Kids & Baby': ['000', '00', '0', '1', '2', '3', '4', '5', '6', '7', '8'],
};

export const COLORS = ['Black', 'White', 'Navy', 'Red', 'Pink', 'Grey', 'Green', 'Blue', 'Beige', 'Brown'];

export const CATEGORIES = ['All', 'Womens', 'Mens', 'Kids & Baby', 'Home & Living', 'Tech & Gaming', 'Toys', 'Easter'];

export const CATALOG: CatalogItem[] = [
  // Womens
  { id: 'w001', name: 'Sleeveless Satin Lace V-Neck Midi Dress', price: 28.00, category: 'Womens', image: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069423_1.jpg', barcode: '9300601000001' },
  { id: 'w002', name: 'Long Sleeve Collared Mini Dress', price: 28.00, category: 'Womens', image: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069424_1.jpg', barcode: '9300601000002' },
  { id: 'w003', name: 'Long Sleeve Waist Tie Maxi Dress', price: 30.00, category: 'Womens', image: 'https://media.kmart.com.au/wcsstore/GlobalSAS/images/catalog/products/S42069425_1.jpg', barcode: '9300601000003' },
  { id: 'w004', name: "Women's V-Neck Linen Blend Tee", price: 14.00, category: 'Womens', image: 'https://picsum.photos/seed/wom4/160/160', barcode: '9300601000004' },
  { id: 'w005', name: "Women's Wide Leg Pants", price: 22.00, category: 'Womens', image: 'https://picsum.photos/seed/wom5/160/160', barcode: '9300601000005' },
  { id: 'w006', name: "Women's Ribbed Tank Top", price: 10.00, category: 'Womens', image: 'https://picsum.photos/seed/wom6/160/160', barcode: '9300601000006' },
  // Mens
  { id: 'm001', name: "Men's Regular Fit Crew Tee", price: 10.00, category: 'Mens', image: 'https://picsum.photos/seed/men1/160/160', barcode: '9300601000011' },
  { id: 'm002', name: "Men's Slim Fit Chino Pants", price: 25.00, category: 'Mens', image: 'https://picsum.photos/seed/men2/160/160', barcode: '9300601000012' },
  { id: 'm003', name: "Men's Fleece Zip Hoodie", price: 30.00, category: 'Mens', image: 'https://picsum.photos/seed/men3/160/160', barcode: '9300601000013' },
  { id: 'm004', name: "Men's Denim Shorts", price: 20.00, category: 'Mens', image: 'https://picsum.photos/seed/men4/160/160', barcode: '9300601000014' },
  // Kids & Baby
  { id: 'k001', name: "Kids' Long Sleeve Pyjama Set", price: 16.00, category: 'Kids & Baby', image: 'https://picsum.photos/seed/kid1/160/160', barcode: '9300601000021' },
  { id: 'k002', name: "Kids' Stripe PJ Set", price: 14.00, category: 'Kids & Baby', image: 'https://picsum.photos/seed/kid2/160/160', barcode: '9300601000022' },
  { id: 'k003', name: "Baby Cotton Bodysuit 3-Pack", price: 12.00, category: 'Kids & Baby', image: 'https://picsum.photos/seed/kid3/160/160', barcode: '9300601000023' },
  { id: 'k004', name: "Kids' Zip Fleece Jacket", price: 22.00, category: 'Kids & Baby', image: 'https://picsum.photos/seed/kid4/160/160', barcode: '9300601000024' },
  // Home & Living
  { id: 'h001', name: 'Anko Queen Microfibre Sheet Set', price: 35.00, category: 'Home & Living', image: 'https://picsum.photos/seed/hom1/160/160', barcode: '9300601000031' },
  { id: 'h002', name: 'Anko Standard Pillow 2-Pack', price: 18.00, category: 'Home & Living', image: 'https://picsum.photos/seed/hom2/160/160', barcode: '9300601000032' },
  { id: 'h003', name: 'Anko Cotton Bath Towel 2-Pack', price: 22.00, category: 'Home & Living', image: 'https://picsum.photos/seed/hom3/160/160', barcode: '9300601000033' },
  { id: 'h004', name: 'Ceramic Mug Set of 4', price: 14.00, category: 'Home & Living', image: 'https://picsum.photos/seed/hom4/160/160', barcode: '9300601000034' },
  { id: 'h005', name: 'Non-Stick Frypan 28cm', price: 28.00, category: 'Home & Living', image: 'https://picsum.photos/seed/hom5/160/160', barcode: '9300601000035' },
  // Tech & Gaming
  { id: 't001', name: 'Anko Wireless Earbuds', price: 29.00, category: 'Tech & Gaming', image: 'https://picsum.photos/seed/tec1/160/160', barcode: '9300601000041' },
  { id: 't002', name: 'Anko Bluetooth Speaker', price: 35.00, category: 'Tech & Gaming', image: 'https://picsum.photos/seed/tec2/160/160', barcode: '9300601000042' },
  { id: 't003', name: 'USB-C Charging Cable 2m', price: 9.00, category: 'Tech & Gaming', image: 'https://picsum.photos/seed/tec3/160/160', barcode: '9300601000043' },
  { id: 't004', name: 'Anko 20W Fast Charger', price: 19.00, category: 'Tech & Gaming', image: 'https://picsum.photos/seed/tec4/160/160', barcode: '9300601000044' },
  // Toys
  { id: 'y001', name: 'Bluey Easter Hunt Pack 125g', price: 9.00, category: 'Toys', image: 'https://picsum.photos/seed/toy1/160/160', barcode: '9300601000051' },
  { id: 'y002', name: 'Vtech Winnie the Pooh Storybook', price: 22.00, category: 'Toys', image: 'https://picsum.photos/seed/toy2/160/160', barcode: '9300601000052' },
  { id: 'y003', name: 'Kids Art & Craft Set', price: 15.00, category: 'Toys', image: 'https://picsum.photos/seed/toy3/160/160', barcode: '9300601000053' },
  { id: 'y004', name: 'Foam Dart Blaster', price: 18.00, category: 'Toys', image: 'https://picsum.photos/seed/toy4/160/160', barcode: '9300601000054' },
  // Easter
  { id: 'e001', name: 'Golden Gaytime Egg 150g', price: 8.00, category: 'Easter', image: 'https://picsum.photos/seed/eas1/160/160', barcode: '9300601000061' },
  { id: 'e002', name: 'Bluey Milk Chocolate Eggs 100g', price: 5.50, category: 'Easter', image: 'https://picsum.photos/seed/eas2/160/160', barcode: '9300601000062' },
  { id: 'e003', name: 'Nestle Milkybar Egg 72g', price: 6.00, category: 'Easter', image: 'https://picsum.photos/seed/eas3/160/160', barcode: '9300601000063' },
  { id: 'e004', name: 'Bluey Hollow Easter Egg 40g', price: 3.00, category: 'Easter', image: 'https://picsum.photos/seed/eas4/160/160', barcode: '9300601000064' },
];
