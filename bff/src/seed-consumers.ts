/**
 * Seeds demo loyalty consumers in BSP CDM and prints the card→BSP-ID map
 * to paste into loyalty.ts CONSUMER_MAP.
 *
 * BSP auto-generates consumerAccountNumber — we cannot set it ourselves.
 * Run once, capture the output, paste the map into loyalty.ts.
 *
 * Usage (from bff/):
 *   npx tsx src/seed-consumers.ts
 */
import 'dotenv/config';
import { ncrRequest } from './lib/ncrClient.js';

const DEMO_CONSUMERS = [
  // Short demo card numbers used during live demos
  { cardNumber: '7',            firstName: 'Demo',    lastName: 'Flybuys',     email: 'demo7@voyixmobile.demo',  cardType: 'flybuys'    },
  { cardNumber: '8',            firstName: 'Demo',    lastName: 'TeamMember',  email: 'demo8@voyixmobile.demo',  cardType: 'teamMember' },
  { cardNumber: '9',            firstName: 'Demo',    lastName: 'OnePass',     email: 'demo9@voyixmobile.demo',  cardType: 'onepass'    },
  // Named demo cards
  { cardNumber: '111122223333', firstName: 'Sarah',   lastName: 'Johnson',     email: 'sarah.j@voyixmobile.demo', cardType: 'flybuys'   },
  { cardNumber: '123412341234', firstName: 'Michael', lastName: 'Chen',        email: 'michael.c@voyixmobile.demo', cardType: 'flybuys' },
  { cardNumber: '444455556666', firstName: 'James',   lastName: 'Taylor',      email: 'james.t@voyixmobile.demo', cardType: 'teamMember' },
  { cardNumber: '777788889999', firstName: 'Olivia',  lastName: 'Brown',       email: 'olivia.b@voyixmobile.demo', cardType: 'onepass'  },
];

console.log('Seeding demo loyalty consumers in BSP CDM...\n');
const map: { cardNumber: string; bspId: string; firstName: string; lastName: string; cardType: string }[] = [];

for (const c of DEMO_CONSUMERS) {
  // Check if already seeded by email
  const { status: fs, data: fd } = await ncrRequest<any>('/cdm/consumers/find', {
    method: 'POST',
    body: { operator: 'AND', searchCriteria: { emailAddress: c.email } },
  });

  if (fs === 200 && (fd as any)?.consumers?.length > 0) {
    const existing = (fd as any).consumers[0];
    map.push({ cardNumber: c.cardNumber, bspId: existing.consumerAccountNumber, firstName: c.firstName, lastName: c.lastName, cardType: c.cardType });
    console.log(`✓ ${c.cardNumber.padEnd(16)} already exists → ${existing.consumerAccountNumber}  (${c.firstName} ${c.lastName})`);
    continue;
  }

  const { status: ps, data: pd } = await ncrRequest<any>('/cdm/consumers', {
    method: 'POST',
    body: { firstName: c.firstName, lastName: c.lastName, emailAddress: c.email },
  });

  if (ps === 200 && (pd as any)?.consumerAccountNumber) {
    const bspId = (pd as any).consumerAccountNumber;
    map.push({ cardNumber: c.cardNumber, bspId, firstName: c.firstName, lastName: c.lastName, cardType: c.cardType });
    console.log(`✓ ${c.cardNumber.padEnd(16)} created   → ${bspId}  (${c.firstName} ${c.lastName})`);
  } else {
    console.log(`✗ ${c.cardNumber.padEnd(16)} FAILED (${ps}): ${JSON.stringify(pd).slice(0, 100)}`);
  }

  await new Promise(r => setTimeout(r, 150));
}

console.log('\n--- Paste into bff/src/routes/loyalty.ts ---');
console.log('const CONSUMER_MAP: Record<string, { bspId: string; firstName: string; lastName: string }> = {');
for (const { cardNumber, bspId, firstName, lastName } of map) {
  console.log(`  '${cardNumber}': { bspId: '${bspId}', firstName: '${firstName}', lastName: '${lastName}' },`);
}
console.log('};');
