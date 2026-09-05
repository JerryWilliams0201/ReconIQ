import { PrismaClient, Transaction } from '@prisma/client';
import { evaluateMatchCandidates } from './llm';

const prisma = new PrismaClient();

export async function runReconciliation() {
  console.log('Starting reconciliation run...');
  
  // 1. Fetch all transactions that don't have a reconciliationId
  const unresolvedTxns = await prisma.transaction.findMany({
    where: { reconciliationId: null }
  });

  if (unresolvedTxns.length === 0) {
    return { message: 'No new transactions to reconcile.' };
  }

  // 2. Group by referenceId
  const grouped = new Map<string, Transaction[]>();
  for (const txn of unresolvedTxns) {
    const ref = txn.referenceId;
    if (!grouped.has(ref)) grouped.set(ref, []);
    grouped.get(ref)!.push(txn);
  }

  const fuzzyCandidates: Transaction[][] = [];
  const orphans: Transaction[][] = [];

  // 3. Deterministic Pass
  for (const [ref, group] of grouped.entries()) {
    // True orphans — IDs that appear only once and have no counterpart
    if (group.length === 1) {
      orphans.push(group);
      continue;
    }

    if (group.length >= 2) {
      const allSameAmount = group.every(t => t.amount === group[0].amount);
      const allSameDate = group.every(t => t.date.getTime() === group[0].date.getTime());
      
      if (allSameAmount && allSameDate) {
        // Perfect deterministic match
        await createReconciliation(group, 'AUTO_MATCHED', 'EXACT_MATCH', 100, 'Matched deterministically on exact amount and date.');
        continue;
      }
    }
    
    // If not deterministic, send to fuzzy pass
    fuzzyCandidates.push(group);
  }

  // 4. LLM-Assisted Fuzzy Resolution
  if (fuzzyCandidates.length > 0) {
    for (let i = 0; i < fuzzyCandidates.length; i += 10) {
      const batch = fuzzyCandidates.slice(i, i + 10);
      const llmResults = await evaluateMatchCandidates(batch);
      
      for (let j = 0; j < batch.length; j++) {
        const group = batch[j];
        const res = llmResults[j];
        
        if (res.status === 'LLM_MATCHED') {
           await createReconciliation(group, 'LLM_MATCHED', res.category, res.confidence, res.reasoning);
        } else {
           // Exception categorization for LLM-rejected matches
           let category = 'UNEXPLAINED_GAP';
           if (group.length === 2) {
             const sources = new Set(group.map(t => t.source));
             if (!sources.has('BANK')) category = 'PENDING_SETTLEMENT';
           }
           await createReconciliation(group, 'UNRESOLVED', category, 0, res.reasoning || 'Could not be resolved by automated or LLM passes.');
        }
      }
    }
  }

  // 5. Categorize remaining orphans
  for (const group of orphans) {
    const txn = group[0];
    let category = 'ORPHAN_ENTRY';
    let reasoning = `Orphan ${txn.source} entry — no matching reference found in other sources.`;
    
    // Check if it looks like a duplicate
    const possibleDupes = await prisma.transaction.findMany({
      where: {
        amount: txn.amount,
        source: txn.source,
        id: { not: txn.id },
        reconciliationId: { not: null }
      }
    });
    if (possibleDupes.length > 0) {
      category = 'DUPLICATE';
      reasoning = `Potential duplicate of already-reconciled ${txn.source} transaction with same amount ₹${txn.amount}.`;
    }

    await createReconciliation(group, 'UNRESOLVED', category, 0, reasoning);
  }

  return { message: 'Reconciliation run complete.' };
}

async function createReconciliation(group: Transaction[], status: string, category: string, confidence: number, reasoning: string) {
  const result = await prisma.reconciliationResult.create({
    data: {
      status,
      category,
      confidence,
      reasoning
    }
  });

  await prisma.transaction.updateMany({
    where: { id: { in: group.map(t => t.id) } },
    data: { reconciliationId: result.id }
  });
}
