import { getLatestTelemetry } from "./localDb";

const SENTINEL_BACKEND_URL = "http://localhost:3000";

export interface RagReference {
  id: number;
  title: string;
  timestamp?: string;
  snippet: string;
  score?: string;
  url?: string;
  source?: string;
  technology?: string;
  details?: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface SentinelAIResponse {
  status: "success" | "error";
  text?: string;
  message?: string;
  references?: RagReference[];
}

export interface MemberLocalContext {
  error_log?: string;
  teammate_recent_code?: string;
  developer_id?: string;
  developer_name?: string;
}

/**
 * Queries the local SQLite telemetry table for recent Pieces code snippets,
 * then sends them alongside the user's question to the Sentinel AI backend.
 * Returns { text, references } so the UI can render citation chips.
 */
export async function askSentinelAI(
  userQuery: string,
  options?: { teamId?: string | null },
): Promise<{ text: string; references: RagReference[] }> {
  try {
    // 1. Fetch the most recent telemetry row from local SQLite via Drizzle
    const latestTelemetry = await getLatestTelemetry();

    // 2. Parse the serialized code_snippets back into an array
    let codeSnippets: string[] = [];
    if (latestTelemetry?.codeSnippets) {
      try {
        codeSnippets = JSON.parse(latestTelemetry.codeSnippets) as string[];
      } catch (parseError) {
        console.warn("[askSentinelAI] Failed to parse code_snippets from telemetry:", parseError);
      }
    }

    const teammateRecentCode =
      codeSnippets.length > 0
        ? codeSnippets.join("\n\n---\n\n")
        : "No recent code snippet available from Pieces OS.";

    const branch = latestTelemetry?.branch ?? "unknown";

    // 3. Construct the payload matching the API contract
    const payload = {
      user_query: userQuery,
      mode: "team_overview",
      team_id: options?.teamId ?? undefined,
      local_context: {
        error_log: "No error log available (background telemetry capture).",
        teammate_recent_code: teammateRecentCode,
      },
      branch,
    };

    console.info("[askSentinelAI] Sending payload to backend:", {
      user_query: payload.user_query,
      branch: payload.branch,
      snippetCount: codeSnippets.length,
    });

    // 4. POST to the Sentinel backend
    const response = await fetch(`${SENTINEL_BACKEND_URL}/api/collaborate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Backend returned ${response.status}: ${errorBody}`,
      );
    }

    const data = (await response.json()) as SentinelAIResponse;

    if (data.status === "error") {
      throw new Error(`Sentinel AI error: ${data.message ?? data.text ?? "Unknown backend error"}`);
    }

    return { text: data.text ?? "", references: data.references ?? [] };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error contacting Sentinel AI";
    console.error("[askSentinelAI] Failed:", message);
    throw new Error(message);
  }
}

export async function askSentinelWithContext(
  userQuery: string,
  localContext: MemberLocalContext,
  branch = "unknown",
): Promise<{ text: string; references: RagReference[] }> {
  const payload = {
    user_query: userQuery,
    mode: "member_profile",
    local_context: {
      error_log: localContext.error_log ?? "No error log available.",
      teammate_recent_code:
        localContext.teammate_recent_code ?? "No recent code snippet available from Pieces OS.",
      developer_id: localContext.developer_id,
      developer_name: localContext.developer_name,
    },
    branch,
  };

  const response = await fetch(`${SENTINEL_BACKEND_URL}/api/collaborate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Backend returned ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as SentinelAIResponse;
  if (data.status === "error") {
    throw new Error(`Sentinel AI error: ${data.message ?? data.text ?? "Unknown backend error"}`);
  }

  return { text: data.text ?? "", references: data.references ?? [] };
}

// --- Manifest API (Dynamic Overview + Task Statuses) ---

const EDGE_API_URL = "https://edge-api.kaushik0h0s.workers.dev";

export interface ManifestTask {
  id: number;
  ticket_id: string;
  assignee_email: string;
  title: string | null;
  status: "not_started" | "working" | "done";
  branch_pattern: string | null;
  source: string;
  updated_at: string;
}

export interface ManifestResponse {
  aiGeneratedOverview: string;
  activeTasks: ManifestTask[];
  generatedAt: string | null;
}

/**
 * Fetches the dynamic project manifest from the Cloudflare Worker.
 * Returns the AI-generated 01_Overview text and all active task statuses.
 */
export async function fetchManifest(): Promise<ManifestResponse> {
  try {
    const response = await fetch(`${EDGE_API_URL}/api/manifest`);
    if (!response.ok) {
      throw new Error(`Manifest API returned ${response.status}`);
    }

    const data = await response.json() as {
      status: string;
      aiGeneratedOverview: string;
      activeTasks: ManifestTask[];
      generatedAt: string | null;
    };

    return {
      aiGeneratedOverview: data.aiGeneratedOverview,
      activeTasks: data.activeTasks ?? [],
      generatedAt: data.generatedAt,
    };
  } catch (error) {
    console.error("[fetchManifest] Failed:", error);
    return {
      aiGeneratedOverview:
        "Sentinel Enterprise is a high-availability orchestration layer designed specifically for decentralized development teams. It serves as the primary Truth Engine for synchronizing complex application states across distributed environments.",
      activeTasks: [],
      generatedAt: null,
    };
  }
}

export async function getDeveloperBrief(
  username: string,
  localContext: MemberLocalContext,
): Promise<string> {
  const response = await fetch(
    `${SENTINEL_BACKEND_URL}/api/developer-brief/${encodeURIComponent(username)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local_context: localContext }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Backend returned ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as { status: "success" | "error"; brief?: string; message?: string };
  if (data.status === "error") {
    throw new Error(data.message ?? "Unknown backend error");
  }

  return data.brief ?? "";
}

/**
 * Depth Inspection API — fetches a detailed, RAG-grounded explanation for
 * a specific phrase detected in a developer's AI brief.
 *
 * POST /api/developer-depth/:username
 * Body: { phrase, local_context }
 * Response: { status, text, references? }
 */
export interface DepthExplanationResponse {
  text: string;
  references: RagReference[];
}

export async function getDepthExplanation(
  memberUsername: string,
  phrase: string,
  localContext?: MemberLocalContext,
): Promise<DepthExplanationResponse> {
  const response = await fetch(
    `${SENTINEL_BACKEND_URL}/api/developer-depth/${encodeURIComponent(memberUsername)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phrase,
        local_context: localContext ?? {},
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Backend returned ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as SentinelAIResponse;
  if (data.status === "error") {
    throw new Error(data.message ?? "Unknown backend error");
  }

  return { text: data.text ?? "", references: data.references ?? [] };
}
