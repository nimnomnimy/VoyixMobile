import 'dotenv/config';
import { ncrSiteRequest } from './lib/ncrClient.js';

// First create a test order
const { status: cs, data: cd } = await ncrSiteRequest<any>('/order/3/orders/1', {
  method: 'POST',
  body: { status: 'OrderPlaced', currency: 'AUD', channel: 'Web', orderLines: [] },
});
console.log('Create order:', cs);
const orderId = cd?.id;
if (!orderId) { console.log('No order ID, aborting'); process.exit(1); }
console.log('Order ID:', orderId);

// Try patching with various metadata fields
const patches = [
  { label: 'customAttributes', body: { customAttributes: [{ name: 'loyaltyCard', value: 'flybuys:111122223333' }] } },
  { label: 'notes', body: { notes: 'loyalty:flybuys:111122223333' } },
  { label: 'externalIdentifiers', body: { externalIdentifiers: [{ type: 'loyalty', value: 'flybuys:111122223333' }] } },
  { label: 'orderAttributes', body: { orderAttributes: { loyaltyCardNumber: '111122223333', loyaltyCardType: 'flybuys' } } },
  { label: 'references', body: { references: [{ type: 'loyalty', value: 'flybuys:111122223333' }] } },
];

for (const p of patches) {
  const { status, data } = await ncrSiteRequest(`/order/3/orders/1/${orderId}`, {
    method: 'PATCH',
    body: p.body,
  });
  const accepted = status < 400;
  console.log(`\nPATCH ${p.label}: ${status} ${accepted ? '✓' : '✗'}`);
  if (!accepted) console.log(JSON.stringify(data).slice(0, 200));
}

// Fetch the order to see what stuck
const { data: fetched } = await ncrSiteRequest<any>(`/order/3/orders/1/${orderId}`);
console.log('\nFetched order keys:', Object.keys(fetched ?? {}));
const interesting = ['customAttributes','notes','externalIdentifiers','orderAttributes','references','loyaltyCard'];
for (const k of interesting) {
  if (fetched?.[k]) console.log(`  ${k}:`, JSON.stringify(fetched[k]).slice(0, 200));
}

// Cancel the test order
await ncrSiteRequest(`/order/3/orders/1/${orderId}`, { method: 'PATCH', body: { status: 'Cancelled' } });
console.log('\nTest order cancelled.');
