# ReconIQ — Payment Reconciliation Copilot

ReconIQ is a full-stack application designed to automate payment reconciliation across bank settlement files, payment gateway reports, and internal ledgers. It uses a hybrid approach:
1. **Deterministic Matching**: Instantly auto-matches exact records (amount + date).
2. **LLM-Assisted Fuzzy Resolution**: Uses Anthropic's Claude API to resolve "near-misses" (partial refunds, fee deductions, date drifts).
3. **Exception Categorization**: Identifies unresolved anomalies like orphans and pending settlements.
4. **Natural Language Q&A**: Allows users to chat with their reconciliation data.

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS v4, Lucide Icons
- **Backend**: Node.js, Express, TypeScript, Prisma (SQLite)
- **AI/LLM**: Anthropic API (`@anthropic-ai/sdk`)

## Local Development Setup

### 1. Prerequisites
Ensure you have Node.js (v18+) and npm installed.

### 2. Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Create a `.env` file based on `.env.example` or simply edit the existing `.env`.
   - **Crucial**: To enable real LLM matching and natural language Q&A, set your Anthropic API key:
     ```env
     ANTHROPIC_API_KEY=your_actual_api_key_here
     ```
     *(Note: If left as `mocked_key`, the backend will use a heuristic-based smart mock that simulates LLM responses).*

4. Generate the Prisma Client and run migrations:
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```
   *(If `migrate dev` is unavailable, you can use `npx prisma db push`)*

5. Seed the database with synthetic transaction data (Bank, PG, Ledger):
   ```bash
   npm run seed
   ```

6. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend will run on `http://localhost:3001`.

### 3. Frontend Setup
1. In a new terminal, navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to the URL provided by Vite (usually `http://localhost:5173`).

## Usage Guide
- **Dashboard**: View high-level statistics of your reconciliation health.
- **Run Engine**: Click the "Run Engine" button to trigger a fresh reconciliation pass on unresolved transactions.
- **Exceptions Panel**: Switch to the Exceptions tab to review categorized anomalies (Orphans, Pending Settlements, Duplicates).
- **Copilot Chat**: Click the floating chat bubble to ask natural language questions about your data (e.g., "How many pending settlements are there?").

## Architecture Notes
- The database is a local SQLite file (`dev.db` in the backend folder) for easy setup.
- The `seed.ts` script generates ~450 transactions with a realistic distribution of exact matches, near-misses, and true anomalies.
