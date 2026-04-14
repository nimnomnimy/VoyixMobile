import 'dotenv/config';
import { ncrRequest } from './lib/ncrClient.js';

// Try common CDM field names for the find endpoint
const fields = ['consumerAccountNumber', 'cardNumber', 'emailAddress', 'phoneNumber', 'lastName'];
for (const f of fields) {
  const { status, data } = await ncrRequest<any>('/cdm/consumers/find', {
    method: 'POST',
    body: { operator: 'AND', searchCriteria: { [f]: 'flybuys' } },
  });
  console.log(`field ${f}:`, status, JSON.stringify(data).slice(0, 120));
}
