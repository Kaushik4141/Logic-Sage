import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import webhookRouter from './webhookrouter.js';
import { piecesRAG } from './lib/pieces-rag.js';
import { getRecentCodeSnippets } from './lib/pieces.js';

// --- Cerebras AI Provider ---
const cerebras = createOpenAI({
  baseURL: 'https://api.cerebras.ai/v1',
  apiKey: process.env.CEREBRAS_API_KEY || '',
});

const app = express();
const port = 3000;
const PRIMARY_MODEL   = process.env.CEREBRAS_PRIMARY_MODEL   || 'llama3.1-8b';
const FALLBACK_MODEL  = process.env.CEREBRAS_FALLBACK_MODEL  || 'llama3.1-8b';

// --- RAG Initialization ---
async function initRAG() {
  try {
    console.log("🚀 [Sentinel] Initialising Pieces RAG...");
    const piecesData = await getRecentCodeSnippets();
    await piecesRAG.index(piecesData);
    console.log("✅ [Sentinel] RAG ready");
  } catch (err) {
    console.error("❌ [Sentinel] RAG init failed:", err);
  }
}

initRAG();

// Auto-refresh RAG every 5 minutes
setInterval(async () => {
  try {
    const data = await getRecentCodeSnippets();
    if (data) {
      await piecesRAG.addContext(data);
    }
  } catch (err) {
    console.error("[Sentinel] Auto-refresh RAG failed:", err);
  }
}, 5 * 60 * 1000);

// --- Middleware ---
const DEFAULT_ORIGINS = 'http://localhost:1420,tauri://localhost,https://tauri.localhost';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Tauri desktop, Postman, curl)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
}));
app.use(express.json());
app.use('/', webhookRouter);

// --- Type Definitions ---
interface CollaborateRequest {
  user_query: string;
  local_context: {
    error_log?: string;
    teammate_recent_code?: string;
    [key: string]: unknown;
  };
  branch?: string;
}

interface CollaborateSuccessResponse {
  status: 'success';
  text: string;
}

interface CollaborateErrorResponse {
  status: 'error';
  message: string;
}

type CollaborateResponse = CollaborateSuccessResponse | CollaborateErrorResponse;

// --- Sentinel System Prompt ---
const SENTINEL_SYSTEM_PROMPT = `You are Sentinel, an enterprise context router. Use the uncommitted teammate code provided in the context to explain why the user's app is breaking.

CRITICAL: If you see the string [REDACTED_BY_SENTINEL], you must explicitly state that a secret was securely protected by the local Zero-Leak protocol. Do not attempt to guess the secret. Focus only on the code logic.

Rules:
1. Answer deterministically based on the provided context.
2. Explicitly state why a bug is happening based on the teammate's local changes.
3. If the context is insufficient, state exactly what information is missing.
4. Keep your explanations concise, focusing entirely on unblocking the developer based on the structural changes in the uncommitted code.
5. Maintain a professional and direct tone.`;

// --- Routes ---
app.post('/api/collaborate', async (req: Request, res: Response<CollaborateResponse>): Promise<void> => {
  try {
    const { user_query, local_context, branch } = req.body as CollaborateRequest;

    if (!user_query && !req.body.query && !req.body.userMessage) {
      res.status(400).json({ status: 'error', message: 'Missing user_query' });
      return;
    }

    const question = user_query ?? req.body.query ?? req.body.userMessage ?? "";
    
    // Condense local context to prevent massive payloads from blowing up the token limit
    let condensedContext = "";
    if (local_context) {
      const rawContext = JSON.stringify(local_context, null, 2);
      condensedContext = rawContext.length > 4000 ? rawContext.substring(0, 4000) + "... (truncated)" : rawContext;
    }

    const augmentedQuery = `Branch: ${branch ?? 'unknown'}\nLocal Context:\n${condensedContext}\n\nUser Query: ${question}`;

    // RAG: retrieves relevant Pieces chunks using the core question, then sends the augmented query to Cerebras
    const answer = await piecesRAG.ask(question, augmentedQuery);

    res.json({ status: 'success', text: answer });
  } catch (error: any) {
    console.error('Error in /api/collaborate:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Internal server error' });
  }
});

// --- RAG Utility Endpoints ---
app.post('/api/rag/update', async (req: Request, res: Response): Promise<void> => {
  const { data } = req.body;
  if (!data) {
    res.status(400).json({ status: 'error', message: 'No data provided' } as any);
    return;
  }

  await piecesRAG.addContext(data);
  res.json({ ok: true, status: piecesRAG.status() } as any);
});

app.get('/api/rag/status', (_req: Request, res: Response): void => {
  res.json(piecesRAG.status() as any);
});

app.post('/api/developer-brief/:username', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.params;
    const { local_context } = req.body;

    if (!local_context) {
      res.status(400).json({ status: 'error', message: 'Missing local_context' });
      return;
    }

    const edgeApiUrl = process.env.EDGE_API_URL || 'http://127.0.0.1:8787';
    let historyData = null;
    try {
      const historyRes = await fetch(`${edgeApiUrl}/api/history/${username}`);
      if (historyRes.ok) {
        historyData = await historyRes.json();
      } else {
        console.warn(`[Sentinel] History API returned status ${historyRes.status}`);
      }
    } catch (err) {
      console.warn(`[Sentinel] Failed to fetch history from ${edgeApiUrl}:`, err);
    }

    const prompt = `History:\n${JSON.stringify(historyData, null, 2)}\n\nLocal Context:\n${JSON.stringify(local_context, null, 2)}`;
    const systemPrompt = 'Given this history and this local desktop context, write a 1-sentence brief of what this dev is doing.';

    let result;
    try {
      result = await generateText({
        model: cerebras.chat(PRIMARY_MODEL),
        system: systemPrompt,
        prompt,
      });
    } catch (primaryError) {
      console.warn(`[Sentinel] Primary model (${PRIMARY_MODEL}) failed — attempting fallback.`, primaryError);
      try {
        result = await generateText({
          model: cerebras.chat(FALLBACK_MODEL),
          system: systemPrompt,
          prompt,
        });
      } catch (fallbackError) {
        console.error(`[Sentinel] Fallback model (${FALLBACK_MODEL}) also failed.`, { primaryError, fallbackError });
        throw fallbackError;
      }
    }

    res.json({ status: 'success', brief: result.text });
  } catch (error) {
    console.error('Error in /api/developer-brief:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Sentinel Backend Orchestrator listening at http://localhost:${port}`);
});
