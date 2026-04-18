import { getLatestTelemetry } from "./localDb";

const EDGE_API_URL = "http://localhost:8787";

/**
 * Reads the most recent local telemetry row and pushes it
 * to the Cloudflare Worker → D1 analytics table.
 */
export async function syncTelemetryToCloud(): Promise<void> {
  try {
    const latest = await getLatestTelemetry();

    if (!latest) {
      console.warn("[Cloud Sync] No local telemetry rows found — nothing to sync.");
      return;
    }

    // Parse the serialized code_snippets string back into an array
    let snippets: string[] = [];
    if (latest.codeSnippets) {
      try {
        snippets = JSON.parse(latest.codeSnippets) as string[];
      } catch (parseError) {
        console.warn("[Cloud Sync] Failed to parse code_snippets:", parseError);
      }
    }

    const payload = {
      branch: latest.branch,
      codeSnippets: snippets,
      timestamp: latest.createdAt,
    };

    console.info("[Cloud Sync] Pushing telemetry to edge:", {
      branch: payload.branch,
      snippetCount: snippets.length,
      timestamp: payload.timestamp,
    });

    const response = await fetch(`${EDGE_API_URL}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Edge API returned ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as { status: string; message?: string };

    if (data.status !== "success") {
      throw new Error(`Edge API error: ${data.message ?? "Unknown error"}`);
    }

    console.log("[Cloud Sync] Successfully pushed to Cloudflare D1");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown cloud sync error";
    console.error("[Cloud Sync] Failed:", message);
    throw new Error(message);
  }
}
