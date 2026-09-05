const API_URL = 'http://localhost:3001/api';

export async function getReconciliations() {
  const res = await fetch(`${API_URL}/reconciliations`);
  if (!res.ok) throw new Error('Failed to fetch reconciliations');
  return res.json();
}

export async function triggerReconciliation() {
  const res = await fetch(`${API_URL}/reconcile`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to trigger reconciliation');
  return res.json();
}

export async function getReconciliationSummary() {
  const data = await getReconciliations();
  return JSON.stringify(data.stats);
}

export async function uploadCSVs(files: { bank?: string; pg?: string; ledger?: string }) {
  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(files),
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function resetData() {
  const res = await fetch(`${API_URL}/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Reset failed');
  return res.json();
}

export async function askCopilot(query: string) {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('Failed to get chat response');
  const data = await res.json();
  return data.answer || "I'm sorry, I couldn't process that.";
}
