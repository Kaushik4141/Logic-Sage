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
const port = 3000;

// FIXED: Added hyphens to model names to match Cerebras API spec
const PRIMARY_MODEL = process.env.CEREBRAS_PRIMARY_MODEL || 'llama3.1-8b';
const FALLBACK_MODEL = process.env.CEREBRAS_FALLBACK_MODEL || 'llama3.1-8b';

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

app.get('/api/team-map', async (req: Request, res: Response): Promise<void> => {
  try {
    const edgeApiUrl = process.env.EDGE_API_URL || 'http://127.0.0.1:8787';
    let eventsData = null;
    try {
      // FIXED: Changed fetch URL from /api/events to /api/team-history
      const eventsRes = await fetch(`${edgeApiUrl}/api/team-history`);
      if (eventsRes.ok) {
        const jsonResponse = (await eventsRes.json()) as any;
        eventsData = jsonResponse.data;
      } else {
        console.warn(`[Sentinel] Events API returned status ${eventsRes.status}`);
      }
    } catch (err) {
      console.warn(`[Sentinel] Failed to fetch events from ${edgeApiUrl}:`, err);
    }

    if (!eventsData) {
      res.status(502).json({ error: 'Failed to fetch events' });
      return;
    }

    const prompt = `Recent Events:\n${JSON.stringify(eventsData, null, 2)}`;
    const systemPrompt = `You are a Senior Architect. Based on these recent GitHub merges and Jira tickets, identify which system services (e.g., Auth, Database, API, UI) are being modified. 
Generate a Mermaid.js graph TD diagram showing the flow of work. 

CRITICAL MERMAID SYNTAX RULES:
1. Connect nodes simply: A --> B
2. If you want to add descriptive text to a node, use square brackets WITH QUOTES, but NEVER use the word "label:". 
   - BAD: Auth[label: "fix-auth"]
   - GOOD: Auth["fix-auth"]
3. Keep the graph simple and clean.
Return ONLY the Mermaid code block starting with 'graph TD'.`;
    let result;
    try {
      // FIXED: Added hyphen to the model name
      result = await generateText({
        model: cerebras.chat('llama3.1-8b'),
        system: systemPrompt,
        prompt,
      });
    } catch (error) {
      console.error(`[Sentinel] Model llama3.1-8b failed.`, error);
      res.status(500).json({ error: 'Failed to generate diagram from Cerebras' });
      return;
    }

    let diagram = result.text.trim();
    const mermaidMatch = diagram.match(/```(?:mermaid)?\n?([\s\S]*?)```/i);
    if (mermaidMatch && mermaidMatch[1]) {
      diagram = mermaidMatch[1].trim();
    }

    res.json({ diagram });
  } catch (error) {
    console.error('Error in /api/team-map:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Sentinel Backend Orchestrator listening at http://localhost:${port}`);
});
