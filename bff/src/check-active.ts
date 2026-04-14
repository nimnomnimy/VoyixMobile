import 'dotenv/config';
import { ncrSiteRequest } from './lib/ncrClient.js';

const { status, data } = await ncrSiteRequest<any>(
  '/catalog/v2/item-details/search?itemStatus=ACTIVE&pageSize=200&sortField=ITEM_CODE&sortDirection=ASC'
);
console.log('HTTP', status);
const items: any[] = (data?.pageContent ?? []).map((e: any) => e.item ?? e);
console.log('Total active:', items.length);
for (const i of items) {
  const code = i.itemId?.itemCode ?? i.itemCode ?? '?';
  const desc = typeof i.shortDescription === 'string'
    ? i.shortDescription
    : i.shortDescription?.values?.[0]?.value ?? '';
  console.log(code.padEnd(20), '|', desc.slice(0, 50));
}
