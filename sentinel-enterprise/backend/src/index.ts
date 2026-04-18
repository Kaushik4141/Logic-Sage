import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import webhookRouter from './webhookrouter.js';
import { piecesRAG, type RagReference } from './lib/pieces-rag.js';
import { getRecentCodeSnippets } from './lib/pieces.js';
import { generateTextSafe } from './lib/ai-provider.js';


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

// --- AI Provider initialization is now handled in lib/ai-provider.ts ---

const app = express();
const port = 3000;

// FIXED: Added hyphens to model names to match Cerebras API spec
const PRIMARY_MODEL = process.env.CEREBRAS_PRIMARY_MODEL || 'llama3.1-8b';
const FALLBACK_MODEL = process.env.CEREBRAS_FALLBACK_MODEL || 'llama3.1-8b';

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
  mode?: 'team_overview' | 'member_profile';
  team_id?: string;
  local_context: {
    error_log?: string;
    teammate_recent_code?: string;
    developer_id?: string;
    developer_name?: string;
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

interface CloudTelemetryRecord {
  developer_id?: string;
  branch?: string;
  code_snippets?: string | null;
  timestamp?: string;
  member?: {
    id?: string;
    email?: string;
    role?: string;
    teamId?: string | null;
    jobTitle?: string | null;
  } | null;
}

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

function parseSnippetArray(rawValue: unknown): string[] {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter(Boolean);
    }
    return [String(parsed)];
  } catch {
    return [rawValue];
  }
}

function buildCloudContextText(records: CloudTelemetryRecord[], scope: 'team' | 'member'): string {
  return records
    .map((record, index) => {
      const label =
        record.member?.email ??
        record.member?.id ??
        record.developer_id ??
        `developer-${index + 1}`;
      const snippets = parseSnippetArray(record.code_snippets)
        .map((snippet) => scrubSensitiveText(snippet))
        .filter(Boolean)
        .slice(0, 3)
        .join('\n');

      return [
        `Developer: ${label}`,
        `Scope: ${scope}`,
        `Branch: ${record.branch ?? 'unknown'}`,
        `Timestamp: ${record.timestamp ?? 'unknown'}`,
        snippets || 'No synced code snippets available.',
      ].join('\n');
    })
    .join('\n-----------------------------------------------\n');
}

async function fetchCloudContext(
  mode: 'team_overview' | 'member_profile',
  teamId: string | undefined,
  developerId: string | undefined,
): Promise<{ records: CloudTelemetryRecord[]; text: string }> {
  const edgeApiUrl = process.env.EDGE_API_URL || 'http://127.0.0.1:8787';

  try {
    let targetUrl = '';
    let scope: 'team' | 'member' = 'member';

    if (mode === 'member_profile' && developerId) {
      targetUrl = `${edgeApiUrl}/api/history/${encodeURIComponent(developerId)}`;
      scope = 'member';
    } else if (mode === 'team_overview' && teamId) {
      targetUrl = `${edgeApiUrl}/api/team-history/${encodeURIComponent(teamId)}`;
      scope = 'team';
    } else {
      return { records: [], text: '' };
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      console.warn(`[Sentinel] Cloud context endpoint returned ${response.status} for ${targetUrl}`);
      return { records: [], text: '' };
    }

    const payload = (await response.json()) as { data?: CloudTelemetryRecord[] };
    const records = Array.isArray(payload.data) ? payload.data : [];
    return {
      records,
      text: buildCloudContextText(records, scope),
    };
  } catch (error) {
    console.warn('[Sentinel] Failed to fetch cloud context:', error);
    return { records: [], text: '' };
  }
}

function buildCollaboratePrompt(
  mode: 'team_overview' | 'member_profile',
  question: string,
  branch: string,
  cloudContext: string,
  localContext: string,
  ragContext?: string,
): string {
  const ragSection = ragContext ? `\nPieces RAG context (semantic match from local workstream index):\n${ragContext}` : '';

  if (mode === 'member_profile') {
    return `You are Sentinel. Answer only about this one developer based on the synced cloud telemetry below.

Your job:
- explain what this person has been working on
- explain what kind of role or ownership they seem to have
- mention current focus only as supporting detail
- do not answer with the whole team story unless the user explicitly asks for it
- if the context is thin, say what is missing clearly

Cloud developer context:
${cloudContext || 'No cloud developer context available.'}

Local supporting context:
${localContext || 'No local context available.'}${ragSection}

Branch: ${branch}
User question: ${question}

Answer in plain text.`;
  }

  return `You are Sentinel. Answer at the whole-team and overall-project level using the synced cloud telemetry below.

Your job:
- explain what is happening overall across the team
- synthesize recent branches, workstreams, and code activity into one coherent story
- do not collapse into a single developer unless the user explicitly asks
- if the context is thin, say what is missing clearly

Cloud team context:
${cloudContext || 'No cloud team context available.'}

Local supporting context:
${localContext || 'No local context available.'}${ragSection}

Branch: ${branch}
User question: ${question}

Answer in plain text.`;
}

function buildCollaborateFallback(
  mode: 'team_overview' | 'member_profile',
  cloudContext: string,
): string {
  const summary = cloudContext
    .split('\n')
    .map((line) => sanitizeBriefText(line))
    .filter(Boolean)
    .filter((line) => !/^developer:/i.test(line))
    .filter((line) => !/^scope:/i.test(line))
    .filter((line) => !/^branch:/i.test(line))
    .filter((line) => !/^timestamp:/i.test(line))
    .slice(0, 5)
    .join(' ');

  if (!summary) {
    return mode === 'member_profile'
      ? 'I could not find enough synced cloud telemetry for this developer yet.'
      : 'I could not find enough synced cloud telemetry for this team yet.';
  }

  return mode === 'member_profile'
    ? `From this developer's synced cloud context, their recent work appears to center on ${summary}`
    : `From the team's synced cloud context, the overall story is ${summary}`;
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
    const { user_query, local_context, branch, mode, team_id } = req.body as CollaborateRequest;

    if (!user_query && !req.body.query && !req.body.userMessage) {
      res.status(400).json({ status: 'error', message: 'Missing user_query' });
      return;
    }

    const question = user_query ?? req.body.query ?? req.body.userMessage ?? "";
    const effectiveMode = mode ?? 'team_overview';
    
    // Condense local context to prevent massive payloads from blowing up the token limit
    let condensedContext = "";
    if (local_context) {
      const rawContext = scrubSensitiveText(JSON.stringify(local_context, null, 2));
      condensedContext = rawContext.length > 10000 ? rawContext.substring(0, 10000) + "... (truncated)" : rawContext;
    }

    const developerId =
      typeof local_context?.developer_id === 'string' ? local_context.developer_id : undefined;
    const { text: cloudContextText } = await fetchCloudContext(
      effectiveMode,
      team_id,
      developerId,
    );

    const ragChunks = await piecesRAG.retrieve(question, 5);
    const ragContext = ragChunks.length > 0
      ? ragChunks.map((c, i) => `[${i + 1}] ${scrubSensitiveText(c.content)}`).join('\n\n')
      : undefined;

    const prompt = buildCollaboratePrompt(
      effectiveMode,
      question,
      branch ?? 'unknown',
      cloudContextText,
      condensedContext,
      ragContext,
    );

    try {
      const result = await generateTextSafe({
        prompt,
      });

      res.json({
        status: 'success',
        text: sanitizeBriefText(result.text) || buildCollaborateFallback(effectiveMode, cloudContextText),
        references: [],
      });
      return;
    } catch (modelError) {
      console.warn('[Sentinel] Cloud collaborate generation failed, falling back to deterministic summary.', modelError);
      res.json({
        status: 'success',
        text: buildCollaborateFallback(effectiveMode, cloudContextText),
        references: [],
      });
      return;
    }
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
    const systemPrompt =
      'Given this history and local desktop context, write a concise 2-sentence developer brief. Plain text only. No markdown, headings, labels, or bullet points. Focus on current work, technical direction, and any blocking issue if clearly present.';

    let result;
    try {
      result = await generateTextSafe({
        system: systemPrompt,
        prompt,
      });
    } catch (modelError) {
      console.error(`[Sentinel] All AI models failed for developer brief.`, modelError);
      result = {
        text: buildDeveloperBriefFallback(username, local_context as Record<string, unknown>, historyData),
      };
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
      result = await generateTextSafe({
        system: systemPrompt,
        prompt,
      });
    } catch (error) {
      console.error(`[Sentinel] All AI models failed for team map.`, error);
      // Fallback diagram when all models fail
      const fallbackDiagram = `graph TD
    Client["Tauri Client"] --> EdgeAPI["Cloudflare Edge API"]
    EdgeAPI --> D1["D1 Database"]
    Client --> Backend["Local Node Backend"]
    Backend --> AI["AI Service (Offline/All Providers Failed)"]`;
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
