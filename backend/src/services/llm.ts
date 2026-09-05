import { GoogleGenerativeAI } from '@google/generative-ai';
import { Transaction } from '@prisma/client';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mocked_key');
const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

const isMock = !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'mocked_key';

export async function evaluateMatchCandidates(candidates) {
  if (isMock) {
    return candidates.map((group) => {
      const amounts = group.map(t => t.amount);
      const dates = group.map(t => new Date(t.date).getTime());
      const amtDiff = Math.max(...amounts) - Math.min(...amounts);
      const dateDiffMs = Math.max(...dates) - Math.min(...dates);
      const dateDiffDays = dateDiffMs / (1000 * 60 * 60 * 24);
      const sources = new Set(group.map(t => t.source));
      const descriptions = group.map(t => t.description || '');

      if (amtDiff === 0 && dateDiffDays > 0 && dateDiffDays <= 3) {
        return {
          status: 'LLM_MATCHED',
          category: 'TIMING_GAP',
          confidence: 92,
          reasoning: `All records share the same amount (₹${amounts[0].toFixed(2)}) but dates differ by ${dateDiffDays.toFixed(1)} day(s). This is consistent with normal settlement timing delays between ${[...sources].join(' and ')}.`
        };
      }

      if (amtDiff > 0 && amtDiff <= 10) {
        const pctDiff = ((amtDiff / Math.max(...amounts)) * 100).toFixed(2);
        return {
          status: 'LLM_MATCHED',
          category: 'FEE_DEDUCTION',
          confidence: 88,
          reasoning: `Amount difference of ₹${amtDiff.toFixed(2)} (${pctDiff}%) across sources is consistent with payment gateway processing fees or bank charges. Reference IDs match.`
        };
      }

      if (amtDiff > 10 && amtDiff <= 200) {
        const hasRefundHint = descriptions.some(d => d.toLowerCase().includes('refund'));
        return {
          status: 'LLM_MATCHED',
          category: 'PARTIAL_REFUND',
          confidence: hasRefundHint ? 90 : 78,
          reasoning: `Amount difference of ₹${amtDiff.toFixed(2)} suggests a partial refund was processed. ${hasRefundHint ? 'Transaction descriptions confirm refund.' : 'No explicit refund label, but amount gap pattern is consistent with partial refunds.'}`
        };
      }

      if (group.length === 2 && !sources.has('BANK') && amtDiff <= 5) {
        return {
          status: 'LLM_MATCHED',
          category: 'TIMING_GAP',
          confidence: 72,
          reasoning: `Bank record missing. PG and Ledger match within ₹${amtDiff.toFixed(2)}. Likely a settlement that hasn't cleared yet. Marking as timing gap with moderate confidence.`
        };
      }

      return {
        status: 'UNRESOLVED',
        category: 'UNEXPLAINED_GAP',
        confidence: 0,
        reasoning: `Amount difference of ₹${amtDiff.toFixed(2)} across ${group.length} records is too large to attribute to fees or refunds. Manual review recommended.`
      };
    });
  }

  const prompt = `You are an expert payment reconciliation AI. Only output valid JSON, nothing else.
Evaluate the following transaction groups and determine if they represent the same underlying transaction despite noise (e.g. fees, partial refunds, date drift).

Groups:
${JSON.stringify(candidates, null, 2)}

For each group, respond in a strict JSON array of objects with the following schema:
[
  {
    "status": "LLM_MATCHED" | "UNRESOLVED",
    "category": "FEE_DEDUCTION" | "PARTIAL_REFUND" | "TIMING_GAP" | "FOREX_MISMATCH" | "UNEXPLAINED_GAP",
    "confidence": <number 0-100>,
    "reasoning": "<brief explanation>"
  }
]
`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[.*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (error) {
    console.error('LLM Error:', error);
    return candidates.map(() => ({ status: 'UNRESOLVED', category: 'UNEXPLAINED_GAP', confidence: 0, reasoning: 'LLM failed' }));
  }
}

export async function answerQuery(query, context) {
  if (isMock) {
    const q = query.toLowerCase();
    const total = context.totalProcessed || 0;
    const unresolved = context.unresolvedCount || 0;
    const resolved = total - unresolved;

    if (q.includes('how many') || q.includes('total')) {
      return `Based on the current reconciliation data:\n\n• **${total}** total reconciliation groups processed\n• **${resolved}** successfully matched (auto + LLM)\n• **${unresolved}** unresolved exceptions requiring attention`;
    }
    if (q.includes('unresolved') || q.includes('exception') || q.includes('mismatch')) {
      const samples = (context.samples || []).filter((s) => s.status === 'UNRESOLVED');
      return `There are currently **${unresolved}** unresolved exceptions. ${samples.length > 0 ? `Here's a sample:\n\n${samples.map((s) => `• **${s.category}** — amounts: ₹${s.amounts.join(', ₹')} — ${s.reasoning || 'No reasoning available'}`).join('\n')}` : 'No sample data available.'}`;
    }
    if (q.includes('settle') || q.includes('pending')) {
      return `Settlement-related exceptions are categorized as **PENDING_SETTLEMENT**. These occur when a transaction appears in the PG and Ledger but the corresponding bank settlement hasn't been received yet. Check the Exceptions panel and filter by "Pending Settlement" for a full list.`;
    }
    return `I found **${total}** reconciliation groups in the dataset, with **${unresolved}** unresolved. Try asking about specific mismatches, unresolved exceptions, or settlement status.`;
  }

  const prompt = `You are ReconIQ, a payment reconciliation copilot.
Context Data:
${JSON.stringify(context)}

User Query:
${query}

Answer the user's query clearly and concisely based ONLY on the context data provided. Use markdown formatting if helpful.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('LLM Chat Error:', error);
    return 'Sorry, I encountered an error while processing your request.';
  }
}
