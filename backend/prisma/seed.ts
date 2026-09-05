import { PrismaClient } from '@prisma/client';
import { addDays, subDays } from 'date-fns';

const prisma = new PrismaClient();

function randomFloat(min: number, max: number) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const SOURCES = ['BANK', 'PG', 'LEDGER'];

async function main() {
  console.log('Clearing old data...');
  await prisma.transaction.deleteMany({});
  await prisma.reconciliationResult.deleteMany({});

  console.log('Generating base transactions...');
  const baseCount = 150;
  const transactions = [];

  for (let i = 0; i < baseCount; i++) {
    const baseId = `TXN-${10000 + i}`;
    const baseAmount = randomFloat(100, 5000);
    const baseDate = new Date(Date.now() - randomInt(0, 30) * 86400000); // Past 30 days

    // 70% exact matches across all three sources
    // 20% near misses (fees, date drift, partial refunds)
    // 10% anomalies (missing in one source, duplicates)

    const rand = Math.random();

    if (rand < 0.7) {
      // EXACT MATCH
      for (const source of SOURCES) {
        transactions.push({
          source,
          referenceId: baseId,
          amount: baseAmount,
          date: baseDate,
          description: `Exact match for ${baseId}`,
        });
      }
    } else if (rand < 0.9) {
      // NEAR MISSES
      const anomalyType = randomInt(1, 3);
      if (anomalyType === 1) {
        // Fee deduction in bank
        transactions.push({ source: 'LEDGER', referenceId: baseId, amount: baseAmount, date: baseDate, description: 'Ledger' });
        transactions.push({ source: 'PG', referenceId: baseId, amount: baseAmount, date: baseDate, description: 'PG' });
        transactions.push({ source: 'BANK', referenceId: baseId, amount: parseFloat((baseAmount * 0.98).toFixed(2)), date: baseDate, description: 'Bank - 2% fee' });
      } else if (anomalyType === 2) {
        // Date drift in PG/Bank
        transactions.push({ source: 'LEDGER', referenceId: baseId, amount: baseAmount, date: baseDate, description: 'Ledger' });
        transactions.push({ source: 'PG', referenceId: baseId, amount: baseAmount, date: addDays(baseDate, 1), description: 'PG +1 day' });
        transactions.push({ source: 'BANK', referenceId: baseId, amount: baseAmount, date: addDays(baseDate, 2), description: 'Bank +2 days' });
      } else {
        // Partial refund in PG
        transactions.push({ source: 'LEDGER', referenceId: baseId, amount: baseAmount, date: baseDate, description: 'Ledger' });
        transactions.push({ source: 'PG', referenceId: baseId, amount: parseFloat((baseAmount - 50).toFixed(2)), date: baseDate, description: 'PG partial refund' });
        transactions.push({ source: 'BANK', referenceId: baseId, amount: parseFloat((baseAmount - 50).toFixed(2)), date: baseDate, description: 'Bank partial refund' });
      }
    } else {
      // ANOMALIES
      const anomalyType = randomInt(1, 2);
      if (anomalyType === 1) {
        // Missing in Bank (Pending Settlement)
        transactions.push({ source: 'LEDGER', referenceId: baseId, amount: baseAmount, date: baseDate, description: 'Ledger' });
        transactions.push({ source: 'PG', referenceId: baseId, amount: baseAmount, date: baseDate, description: 'PG' });
      } else {
        // Orphan in Bank
        transactions.push({ source: 'BANK', referenceId: `ORPHAN-${10000 + i}`, amount: baseAmount, date: baseDate, description: 'Orphan bank entry' });
      }
    }
  }

  // Insert all
  console.log(`Inserting ${transactions.length} transactions...`);
  await prisma.transaction.createMany({
    data: transactions,
  });
  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
