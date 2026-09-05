import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { runReconciliation } from './services/reconciliation';
import { answerQuery } from './services/llm';
import { parseCSV } from './services/csv';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // raise limit — CSV text can be sizeable

// Wipe all existing transactions/results so a fresh dataset starts clean
app.post('/api/reset', async (req, res) => {
  try {
    await prisma.transaction.deleteMany({});
    await prisma.reconciliationResult.deleteMany({});
    res.json({ message: 'All data cleared.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset data' });
  }
});

// Upload real CSV data — expects { bank: "csv text", pg: "csv text", ledger: "csv text" }
// Each CSV needs headers: referenceId, amount, date, description (description optional)
// Only the sources actually provided are ingested — you can upload just one or all three.
app.post('/api/upload', async (req, res) => {
  const { bank, pg, ledger } = req.body as { bank?: string; pg?: string; ledger?: string };

  if (!bank && !pg && !ledger) {
    return res.status(400).json({ error: 'Provide at least one of: bank, pg, ledger (CSV text).' });
  }

  const sources: { name: 'BANK' | 'PG' | 'LEDGER'; csv?: string }[] = [
    { name: 'BANK', csv: bank },
    { name: 'PG', csv: pg },
    { name: 'LEDGER', csv: ledger },
  ];

  let inserted = 0;
  const errors: string[] = [];

  try {
    for (const { name, csv } of sources) {
      if (!csv) continue;
      const rows = parseCSV(csv);

      for (const row of rows) {
        const referenceId = row['referenceid'] || row['reference_id'] || row['ref_id'] || row['ref'];
        const amountRaw = row['amount'];
        const dateRaw = row['date'];
        const description = row['description'] || null;

        if (!referenceId || !amountRaw || !dateRaw) {
          errors.push(`Skipped a row in ${name} — missing referenceId, amount, or date.`);
          continue;
        }

        const amount = parseFloat(amountRaw.replace(/[₹,]/g, ''));
        const date = new Date(dateRaw);

        if (isNaN(amount) || isNaN(date.getTime())) {
          errors.push(`Skipped ${referenceId} in ${name} — couldn't parse amount or date.`);
          continue;
        }

        await prisma.transaction.create({
          data: { source: name, referenceId, amount, date, description },
        });
        inserted++;
      }
    }

    res.json({ message: `Uploaded ${inserted} transactions.`, inserted, errors });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get dashboard stats and transactions
app.get('/api/reconciliations', async (req, res) => {
  try {
    const results = await prisma.reconciliationResult.findMany({
      include: { transactions: true },
      orderBy: { createdAt: 'desc' }
    });

    const totalResults = results.length;
    let autoMatched = 0;
    let llmMatched = 0;
    let unresolved = 0;
    let totalReconciledAmount = 0;

    for (const res of results) {
      if (res.status === 'AUTO_MATCHED') autoMatched++;
      if (res.status === 'LLM_MATCHED') llmMatched++;
      if (res.status === 'UNRESOLVED') unresolved++;
      
      if (res.status !== 'UNRESOLVED' && res.transactions.length > 0) {
        totalReconciledAmount += res.transactions[0].amount;
      }
    }

    const stats = {
      total: totalResults,
      autoMatchedPct: totalResults ? Math.round((autoMatched / totalResults) * 100) : 0,
      llmMatchedPct: totalResults ? Math.round((llmMatched / totalResults) * 100) : 0,
      unresolvedPct: totalResults ? Math.round((unresolved / totalResults) * 100) : 0,
      totalReconciledAmount: totalReconciledAmount.toFixed(2)
    };

    res.json({ stats, results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Trigger reconciliation run
app.post('/api/reconcile', async (req, res) => {
  try {
    const result = await runReconciliation();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Reconciliation failed' });
  }
});

// Chat Q&A endpoint
app.post('/api/chat', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    // Generate context for the LLM
    const results = await prisma.reconciliationResult.findMany({
      include: { transactions: true },
      take: 100 // Limit context size
    });
    
    // Pass summary rather than raw data to save tokens
    const context = {
        totalProcessed: results.length,
        unresolvedCount: results.filter(r => r.status === 'UNRESOLVED').length,
        samples: results.slice(0, 10).map(r => ({
            status: r.status,
            category: r.category,
            amounts: r.transactions.map(t => t.amount),
            reasoning: r.reasoning
        }))
    };

    const answer = await answerQuery(query, context);
    res.json({ answer });
  } catch (error) {
    res.status(500).json({ error: 'Chat failed' });
  }
});

app.listen(port, () => {
  console.log(`ReconIQ Backend running on port ${port}`);
});
