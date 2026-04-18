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

/**
 * Queries the local SQLite telemetry table for recent Pieces code snippets,
 * then sends them alongside the user's question to the Sentinel AI backend.
 * Returns { text, references } so the UI can render citation chips.
 */
export async function askSentinelAI(userQuery: string): Promise<{ text: string; references: RagReference[] }> {
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
