import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';
import webhookRouter from './webhookrouter.js';


dotenv.config();

// --- Cerebras AI Provider ---
const cerebras = createOpenAI({
  baseURL: 'https://api.cerebras.ai/v1',
  apiKey: process.env.CEREBRAS_API_KEY || '',
});

const app = express();
const port            = process.env.PORT                     || 3000;
const PRIMARY_MODEL   = process.env.CEREBRAS_PRIMARY_MODEL   || 'llama3.1-8b';
const FALLBACK_MODEL  = process.env.CEREBRAS_FALLBACK_MODEL  || 'llama3.1-8b';

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

    if (!user_query || !local_context) {
      res.status(400).json({ status: 'error', message: 'Missing user_query or local_context' });
      return;
    }

    const prompt = `Branch: ${branch ?? 'unknown'}\nUser Query: ${user_query}\n\nLocal Context:\n${JSON.stringify(local_context, null, 2)}`;

    let result;
    try {
      result = await generateText({
        model: cerebras.chat(PRIMARY_MODEL),
        system: SENTINEL_SYSTEM_PROMPT,
        prompt,
      });
    } catch (primaryError) {
      console.warn(`[Sentinel] Primary model (${PRIMARY_MODEL}) failed — attempting fallback.`, primaryError);
      try {
        result = await generateText({
          model: cerebras.chat(FALLBACK_MODEL),
          system: SENTINEL_SYSTEM_PROMPT,
          prompt,
        });
      } catch (fallbackError) {
        console.error(`[Sentinel] Fallback model (${FALLBACK_MODEL}) also failed.`, { primaryError, fallbackError });
        throw fallbackError;
      }
    }

    res.json({ status: 'success', text: result.text });
  } catch (error) {
    console.error('Error in /api/collaborate:', error);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Sentinel Backend Orchestrator listening at http://localhost:${port}`);
});
