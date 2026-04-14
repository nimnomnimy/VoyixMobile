import 'dotenv/config';
import { ncrSiteRequest } from './lib/ncrClient.js';

// Try PATCH on the main item endpoint with just status
const { status: s1, data: d1 } = await ncrSiteRequest('/catalog/v2/items/k001-2-BLK', {
  method: 'PATCH',
  body: { status: 'INACTIVE' },
});
console.log('PATCH /items/:id {status}:', s1, JSON.stringify(d1 ?? '').slice(0, 300));

await new Promise(r => setTimeout(r, 1500));
const { data } = await ncrSiteRequest<any>('/catalog/v2/item-details/k001-2-BLK');
const i = (data as any)?.item ?? data;
console.log('status after:', i?.status);
