import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import webhookRouter from './webhookrouter.js';
import { piecesRAG, type RagReference } from './lib/pieces-rag.js';
import { getRecentCodeSnippets } from './lib/pieces.js';

const REDACTED = '[REDACTED_BY_SENTINEL]';

function scrubSensitiveText(rawText: string | null | undefined): string {
  if (!rawText) return '';

  let scrubbed = rawText;
  scrubbed = scrubbed.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED);
  scrubbed = scrubbed.replace(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, REDACTED);
  scrubbed = scrubbed.replace(/\b(Bearer\s+)([a-zA-Z0-9\-._~+/]+=*)/gi, `$1${REDACTED}`);
  scrubbed = scrubbed.replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, REDACTED);
  scrubbed = scrubbed.replace(/\/Users\/[^\s/]+/g, REDACTED);
  return scrubbed;
}

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

// --- RAG Initialization ---
// Pulls team telemetry from Cloudflare D1 via the Edge API,
// NOT directly from local Pieces OS. This way RAG works even
// when Pieces OS is offline — all data comes from the synced DB.
const EDGE_API_URL = process.env.EDGE_API_URL || 'https://edge-api.kaushik0h0s.workers.dev';

/**
 * Converts D1 telemetry rows into workstream-formatted strings
 * that the RAG parser can chunk and embed.
 */
function telemetryToWorkstreamText(rows: any[]): string {
  if (!rows || rows.length === 0) return '';
  return rows
    .map((row: any) => {
      const snippets = row.code_snippets ?? row.codeSnippets ?? '';
      const parsed = typeof snippets === 'string' ? snippets : JSON.stringify(snippets);
      return [
        '-----------------------------------------------',
        `-- LIVE WORKSTREAM CONTEXT: ${row.developer_id ?? row.developerId ?? 'unknown'} on ${row.branch ?? 'unknown'}`,
        `Timestamp: ${row.timestamp ?? row.created_at ?? 'unknown'}`,
        parsed,
      ].join('\n');
    })
    .join('\n');
}

async function fetchD1Telemetry(): Promise<string> {
  try {
    const res = await fetch(`${EDGE_API_URL}/api/team-history`);
    if (!res.ok) {
      console.warn(`[Sentinel] Edge API returned ${res.status} for team-history`);
      return '';
    }
    const json = await res.json() as any;
    const rows = json.data ?? json.results ?? [];
    console.log(`📡 [Sentinel] Fetched ${rows.length} telemetry rows from D1`);
    return telemetryToWorkstreamText(rows);
  } catch (err) {
    console.warn('[Sentinel] Could not reach Edge API for RAG init:', err);
    return '';
  }
}

async function initRAG() {
  try {
    console.log("🚀 [Sentinel] Initialising RAG from D1 telemetry...");

    // Primary: fetch from Cloudflare D1 via Edge API
    let data = await fetchD1Telemetry();

    // Fallback: try local Pieces OS if D1 returned nothing
    if (!data) {
      console.log("[Sentinel] D1 returned no data, trying local Pieces OS as fallback...");
      try {
        const piecesData = await getRecentCodeSnippets();
        data = typeof piecesData === 'string' ? piecesData : JSON.stringify(piecesData);
      } catch (piecesErr) {
        console.warn("[Sentinel] Pieces OS fallback also unavailable:", piecesErr);
      }
    }

    await piecesRAG.index(data || '');
    console.log("✅ [Sentinel] RAG ready");
  } catch (err) {
    console.error("❌ [Sentinel] RAG init failed:", err);
  }
}

initRAG();

// Auto-refresh RAG every 5 minutes from D1
setInterval(async () => {
  try {
    const data = await fetchD1Telemetry();
    if (data) {
      await piecesRAG.addContext(data);
    }
  } catch (err) {
    console.error("[Sentinel] Auto-refresh RAG failed:", err);
  }
}, 5 * 60_000);

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
  references?: RagReference[];
}

interface CollaborateErrorResponse {
  status: 'error';
  message: string;
}

type CollaborateResponse = CollaborateSuccessResponse | CollaborateErrorResponse;

function sanitizeBriefText(raw: string | null | undefined): string {
  if (!raw) return '';

  return raw
    .replace(/[*_#>`]/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectSnippetLines(rawValue: unknown): string[] {
  const text = typeof rawValue === 'string' ? rawValue : '';
  if (!text) return [];

  return text
    .split('\n')
    .map(line => sanitizeBriefText(line))
    .filter(Boolean)
    .filter(line => !/^summary id:/i.test(line))
    .filter(line => !/^timestamp:/i.test(line))
    .filter(line => !/^live workstream context:/i.test(line))
    .filter(line => !/^tldr$/i.test(line))
    .filter(line => !/^core tasks/i.test(line))
    .filter(line => !/^key discussions/i.test(line))
    .filter(line => !/^resources reviewed/i.test(line))
    .filter(line => !/^next steps/i.test(line))
    .filter(line => !/^persona report/i.test(line))
    .filter(line => !/^-{3,}$/.test(line));
}

function buildDeveloperBriefFallback(
  username: string,
  localContext: Record<string, unknown>,
  historyData: unknown,
): string {
  const teammateRecentCode = typeof localContext.teammate_recent_code === 'string'
    ? localContext.teammate_recent_code
    : '';
  const errorLog = typeof localContext.error_log === 'string'
    ? localContext.error_log
    : '';

  const branchMatch = errorLog.match(/branch\s+([^\s.]+)/i);
  const branch = branchMatch?.[1] ?? 'an active branch';

  const titleMatches = [...teammateRecentCode.matchAll(/LIVE WORKSTREAM CONTEXT:\s*(.+?)(?:\s*---|\n|$)/gi)]
    .map(match => sanitizeBriefText(match[1]))
    .filter(Boolean)
    .filter(title => title.toLowerCase() !== 'uncategorized activity');

  const snippetLines = collectSnippetLines(teammateRecentCode);
  const historySummary = sanitizeBriefText(JSON.stringify(historyData));

  const focus =
    snippetLines.find(line => line.length > 40) ??
    snippetLines[0] ??
    'recent telemetry and local Pieces context';

  const workstream = titleMatches[0];
  const activityLead = workstream
    ? `${username} is currently focused on ${workstream.toLowerCase()} on ${branch}.`
    : `${username} is currently working on ${branch}.`;

  const detail = focus.endsWith('.') ? focus : `${focus}.`;
  const historyNote = historySummary
    ? ' This summary was generated from synced telemetry because the AI brief service was unavailable.'
    : '';

  return `${activityLead} Latest context indicates ${detail}${historyNote}`;
}

function normalizeRouteParam(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
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
app.post('/api/collaborate', async (req: Request, res: Response<CollaborateResponse>): Promise<void> => {
  try {
    const { user_query, local_context, branch } = req.body as CollaborateRequest;

    if (!user_query && !req.body.query && !req.body.userMessage) {
      res.status(400).json({ status: 'error', message: 'Missing user_query' });
      return;
    }

    const question = user_query ?? req.body.query ?? req.body.userMessage ?? "";
    
    // Condense local context to prevent massive payloads from blowing up the token limit
    // Cerebras llama3.1-8b has an 8K token limit; RAG adds ~2K of its own context
    let condensedContext = "";
    if (local_context) {
      const rawContext = scrubSensitiveText(JSON.stringify(local_context, null, 2));
      condensedContext = rawContext.length > 3000 ? rawContext.substring(0, 3000) + "... (truncated)" : rawContext;
    }

    const augmentedQuery = `Branch: ${branch ?? 'unknown'}\nLocal Context:\n${condensedContext}\n\nUser Query: ${question}`;

    // Pieces context drives both the answer and the supporting references.
    const { text, references } = await piecesRAG.ask(question, augmentedQuery);

    res.json({ status: 'success', text, references });
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
    const username = normalizeRouteParam(req.params.username, 'This developer');
    const { local_context } = req.body;

    if (!local_context) {
      res.status(400).json({ status: 'error', message: 'Missing local_context' });
      return;
    }

    const edgeApiUrl = process.env.EDGE_API_URL || 'https://edge-api.kaushik0h0s.workers.dev';
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

    // Truncate context to fit Cerebras 8K token limit (~6K chars for prompt after system prompt)
    const rawHistory = scrubSensitiveText(JSON.stringify(historyData ?? {}, null, 2));
    const condensedHistory = rawHistory.length > 2000
      ? rawHistory.substring(0, 2000) + '... (truncated)'
      : rawHistory;

    const rawLocal = scrubSensitiveText(JSON.stringify(local_context, null, 2));
    const condensedLocal = rawLocal.length > 3000
      ? rawLocal.substring(0, 3000) + '... (truncated)'
      : rawLocal;

    const prompt = `History:\n${condensedHistory}\n\nLocal Context:\n${condensedLocal}`;
    const systemPrompt =
      'Given this history and local desktop context, write a concise 2-sentence developer brief. Plain text only. No markdown, headings, labels, or bullet points. Focus on current work, technical direction, and any blocking issue if clearly present.';

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
        result = {
          text: buildDeveloperBriefFallback(username, local_context as Record<string, unknown>, historyData),
        };
      }
    }

    res.json({ status: 'success', brief: sanitizeBriefText(result.text) });
  } catch (error) {
    console.error('Error in /api/developer-brief:', error);
    const username = normalizeRouteParam(req.params.username, 'This developer');
    const fallbackBrief = buildDeveloperBriefFallback(
      username,
      (req.body?.local_context ?? {}) as Record<string, unknown>,
      null,
    );
    res.json({ status: 'success', brief: fallbackBrief });
  }
});

// --- Depth Inspection: detailed RAG explanation for a highlighted phrase ---
app.post('/api/developer-depth/:username', async (req: Request, res: Response): Promise<void> => {
  try {
    const username = normalizeRouteParam(req.params.username, 'developer');
    const { phrase, local_context } = req.body;

    if (!phrase) {
      res.status(400).json({ status: 'error', message: 'Missing phrase' });
      return;
    }

    // 1. Fetch this member's cloud telemetry history for additional context
    const edgeApiUrl = process.env.EDGE_API_URL || 'https://edge-api.kaushik0h0s.workers.dev';
    let historyData: any = null;
    try {
      const historyRes = await fetch(`${edgeApiUrl}/api/history/${encodeURIComponent(username)}`);
      if (historyRes.ok) {
        historyData = await historyRes.json();
      }
    } catch (err) {
      console.warn(`[Sentinel] Depth: failed to fetch history for ${username}:`, err);
    }

    // 2. Condense local context + history to fit Cerebras 8K token limit
    //    RAG adds ~2K of its own context chunks, so we cap inputs to ~3K total
    const rawLocalContext = scrubSensitiveText(
      JSON.stringify(local_context ?? {}, null, 2)
    );
    const condensedLocal = rawLocalContext.length > 2000
      ? rawLocalContext.substring(0, 2000) + '... (truncated)'
      : rawLocalContext;

    const rawHistory = scrubSensitiveText(
      JSON.stringify(historyData ?? {}, null, 2)
    );
    const condensedHistory = rawHistory.length > 1500
      ? rawHistory.substring(0, 1500) + '... (truncated)'
      : rawHistory;

    // 3. Run RAG with a depth-specific augmented query
    const augmentedQuery = [
      `Developer: ${username}`,
      `Phrase to explain: "${phrase}"`,
      `\nLocal Context:\n${condensedLocal}`,
      condensedHistory ? `\nCloud History:\n${condensedHistory}` : '',
      `\nProvide an in-depth technical explanation of what "${phrase}" means in this developer's recent work.`,
    ].join('\n');

    // Override the RAG system prompt for depth inspection
    const depthSystemPrompt = `You are an expert technical explainer. The user clicked on the phrase "${phrase}" in a brief summary. Provide a detailed, citation-backed explanation of what this means in the context of this developer's recent work. Use the provided telemetry only. Always cite with [1], [2] etc.

CRITICAL: If you see the string [REDACTED_BY_SENTINEL], you must explicitly state that a secret was securely protected by the local Zero-Leak protocol. Do not attempt to guess the secret.

Structure your response as:
1. What it is — define the phrase in context
2. How it's used — relevant files, APIs, or systems involved
3. Why it matters — decisions, trade-offs, or impact on the project
4. Current status — what the developer was doing with it recently

Be thorough but concise. Use markdown formatting for readability.`;

    let text: string;
    let references: RagReference[] = [];

    try {
      // Use the RAG pipeline — it will search, retrieve chunks, and generate
      const ragResult = await piecesRAG.ask(phrase, augmentedQuery);
      text = ragResult.text;
      references = ragResult.references;
    } catch (ragError) {
      console.warn('[Sentinel] Depth: RAG pipeline failed, falling back to direct generation:', ragError);

      // Fallback: direct Cerebras call without RAG retrieval
      try {
        const directResult = await generateText({
          model: cerebras.chat(PRIMARY_MODEL),
          system: depthSystemPrompt,
          prompt: augmentedQuery,
        });
        text = directResult.text ?? `No detailed explanation could be generated for "${phrase}".`;
      } catch (directError) {
        console.error('[Sentinel] Depth: direct generation also failed:', directError);
        text = `Unable to generate explanation for "${phrase}". Both the RAG pipeline and direct AI generation encountered errors.`;
      }
    }

    res.json({ status: 'success', text, references });
  } catch (error: any) {
    console.error('Error in /api/developer-depth:', error);
    res.status(500).json({ status: 'error', message: error.message || 'Internal server error' });
  }
});

app.get('/api/team-map', async (req: Request, res: Response): Promise<void> => {
  try {
    const edgeApiUrl = process.env.EDGE_API_URL || 'https://edge-api.kaushik0h0s.workers.dev';
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

    // Truncate events data to fit Cerebras 8K token limit
    const rawEvents = JSON.stringify(eventsData, null, 2);
    const condensedEvents = rawEvents.length > 3000
      ? rawEvents.substring(0, 3000) + '\n... (truncated)'
      : rawEvents;

    const prompt = `Recent Events:\n${condensedEvents}`;
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
      result = await generateText({
        model: cerebras.chat(PRIMARY_MODEL),
        system: systemPrompt,
        prompt,
      });
    } catch (error) {
      console.error(`[Sentinel] Model ${PRIMARY_MODEL} failed for team-map.`, error);
      // Fallback diagram when Cerebras quota is exceeded
      const fallbackDiagram = `graph TD
    Client["Tauri Client"] --> EdgeAPI["Cloudflare Edge API"]
    EdgeAPI --> D1["D1 Database"]
    Client --> Backend["Local Node Backend"]
    Backend --> Cerebras["Cerebras AI (Offline/Quota Exceeded)"]`;
      res.json({ diagram: fallbackDiagram, isFallback: true });
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
