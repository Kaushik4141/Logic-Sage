import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';

dotenv.config();

const cerebras = createOpenAI({
  baseURL: 'https://api.cerebras.ai/v1',
  apiKey: process.env.CEREBRAS_API_KEY || '',
});

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Type definition for the incoming request
interface CollaborateRequest {
  user_query: string;
  local_context: {
    error_log?: string;
    teammate_recent_code?: string;
    [key: string]: any;
  };
  branch: string;
}

app.post('/api/collaborate', async (req: Request, res: Response): Promise<any> => {
  try {
    const { user_query, local_context, branch } = req.body as CollaborateRequest;

    if (!user_query || !local_context) {
      return res.status(400).json({ status: "error", message: "Missing user_query or local_context" });
    }

    const systemPrompt = `You are 'Sentinel', an enterprise context router. Your purpose is to provide deterministic answers to cross-team engineering queries using local, uncommitted context from teammates.

Analyze the provided 'local_context' (which represents the uncommitted code and error logs of a teammate) and the 'branch' information to answer the 'user_query'.

Rules:
1. Answer deterministically based on the provided context.
2. Explicitly state why a bug is happening based on the teammate's local changes.
3. If the context is insufficient, state exactly what information is missing.
4. Maintain a professional, concise, and direct tone.`;

    const prompt = `
Branch: ${branch || 'Unknown'}
User Query: ${user_query}

Local Context:
${JSON.stringify(local_context, null, 2)}
`;

    let text = '';
    try {
      const response = await generateText({
        model: cerebras.chat('llama-3.3-70b'),
        system: systemPrompt,
        prompt: prompt,
      });
      text = response.text;
    } catch (fallbackError) {
      console.warn("Primary model failed, falling back to llama3.1-8b...");
      const response = await generateText({
        model: cerebras.chat('llama3.1-8b'),
        system: systemPrompt,
        prompt: prompt,
      });
      text = response.text;
    }

    return res.json({
      status: "success",
      text: text,
    });
  } catch (error) {
    console.error('Error in /api/collaborate:', error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Sentinel Backend Orchestrator listening at http://localhost:${port}`);
});

