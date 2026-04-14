/**
 * Seed script — creates demo loyalty consumers in the BSP CDM.
 *
 * Usage (from bff/):
 *   npx tsx src/seed-consumers.ts
 *
 * CDM endpoint: PUT /cdm/consumers/{consumerAccountNumber}
 * This is idempotent — safe to run multiple times.
 */
import 'dotenv/config';
import { ncrRequest } from './lib/ncrClient.js';

interface DemoConsumer {
  consumerAccountNumber: string;  // also used as the card number in the app
  firstName: string;
  lastName: string;
  cardType: 'flybuys' | 'teamMember' | 'onepass';
}

const CONSUMERS: DemoConsumer[] = [
  // Flybuys cards
  { consumerAccountNumber: '7',             firstName: 'Demo',    lastName: 'Flybuys',     cardType: 'flybuys'     },
  { consumerAccountNumber: '111122223333',  firstName: 'Sarah',   lastName: 'Johnson',     cardType: 'flybuys'     },
  { consumerAccountNumber: '123412341234',  firstName: 'Michael', lastName: 'Chen',        cardType: 'flybuys'     },
  { consumerAccountNumber: '0430044467',    firstName: 'Emma',    lastName: 'Williams',    cardType: 'flybuys'     },
  // Team Member cards
  { consumerAccountNumber: '8',             firstName: 'Demo',    lastName: 'TeamMember',  cardType: 'teamMember'  },
  { consumerAccountNumber: '444455556666',  firstName: 'James',   lastName: 'Taylor',      cardType: 'teamMember'  },
  // OnePass cards
  { consumerAccountNumber: '9',             firstName: 'Demo',    lastName: 'OnePass',     cardType: 'onepass'     },
  { consumerAccountNumber: '777788889999',  firstName: 'Olivia',  lastName: 'Brown',       cardType: 'onepass'     },
];

function log(icon: string, msg: string) {
  console.log(`${icon}  ${msg}`);
}

async function seedConsumer(consumer: DemoConsumer): Promise<boolean> {
  // First try GET to see if consumer already exists
  const { status: getStatus, data: existing } = await ncrRequest<any>(
    `/cdm/consumers/${encodeURIComponent(consumer.consumerAccountNumber)}`
  );
  if (getStatus === 200) {
    log('⏭ ', `[${consumer.cardType}]  ${consumer.consumerAccountNumber}  already exists`);
    return true;
  }

  // POST to create — CDM uses POST for new consumers
  const body = {
    firstName: consumer.firstName,
    lastName: consumer.lastName,
    consumerAccountNumber: consumer.consumerAccountNumber,
    status: 'ACTIVE',
  };

  const { status, data } = await ncrRequest<any>(
    `/cdm/consumers`,
    { method: 'POST', body }
  );

  if (status >= 400) {
    console.error(`   CDM POST ${consumer.consumerAccountNumber} → ${status}`, JSON.stringify(data ?? '').slice(0, 300));
  }

  return status === 200 || status === 201 || status === 204;
}

async function main() {
  log('🌱', `Seeding ${CONSUMERS.length} demo consumers into BSP CDM…\n`);

  let ok = 0, fail = 0;

  for (const consumer of CONSUMERS) {
    const success = await seedConsumer(consumer);
    if (success) {
      ok++;
      log('✅', `[${consumer.cardType}]  ${consumer.consumerAccountNumber}  ${consumer.firstName} ${consumer.lastName}`);
    } else {
      fail++;
      log('❌', `[${consumer.cardType}]  ${consumer.consumerAccountNumber}  ${consumer.firstName} ${consumer.lastName}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log('\n──────────────────────────────────────');
  log('👤', `Consumers: ${ok} seeded, ${fail} failed`);

  if (fail > 0) {
    console.log('\nNote: CDM PUT may require additional provisioning on your BSP account.');
    console.log('The app will still work — failed lookups fall back to "Loyalty Member".');
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
