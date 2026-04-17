import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';

dotenv.config();

// --- Cerebras AI Provider ---
const cerebras = createOpenAI({
  baseURL: 'https://api.cerebras.ai/v1',
  apiKey: process.env.CEREBRAS_API_KEY || '',
});

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors({ origin: 'http://localhost:1420' }));
app.use(express.json());

// --- Type Definitions ---
interface CollaborateRequest {
  user_query: string;
  local_context: {
    error_log?: string;
    teammate_recent_code?: string;
    [key: string]: any;
  };
}

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
app.post('/api/collaborate', async (req: Request, res: Response): Promise<any> => {
  try {
    const { user_query, local_context } = req.body as CollaborateRequest;

    if (!user_query || !local_context) {
      return res.status(400).json({ status: 'error', message: 'Missing user_query or local_context' });
    }

    const prompt = `User Query: ${user_query}\n\nLocal Context:\n${JSON.stringify(local_context, null, 2)}`;

    let result;
    try {
      result = await generateText({
        model: cerebras.chat('llama-3.3-70b'),
        system: SENTINEL_SYSTEM_PROMPT,
        prompt,
      });
    } catch {
      console.warn('Primary model unavailable, falling back to llama3.1-8b...');
      result = await generateText({
        model: cerebras.chat('llama3.1-8b'),
        system: SENTINEL_SYSTEM_PROMPT,
        prompt,
      });
    }

    return res.json({ status: 'success', text: result.text });
  } catch (error) {
    console.error('Error in /api/collaborate:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Sentinel Backend Orchestrator listening at http://localhost:${port}`);
});
