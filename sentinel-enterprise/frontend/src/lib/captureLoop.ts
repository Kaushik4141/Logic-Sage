import { createTables, localTelemetry, localDrizzleDb, getLatestTelemetry } from "./localDb";
import { getRecentCodeSnippets } from "./pieces";
import { syncTelemetryToCloud } from "./cloudSync";

export async function runLocalCapture(developerId?: string): Promise<void> {
  try {
    await createTables();

    const piecesData = await getRecentCodeSnippets();
    console.log("Raw Pieces Data:", piecesData);

    const serializedSnippets = JSON.stringify(piecesData);

    // Extract UUIDs from the snippets to compare, ignoring volatile "12 minutes ago" timestamps
    const extractIds = (str: string | null) => {
      if (!str) return "";
      const matches = [...str.matchAll(/Summary ID: ([a-f0-9-]+)/g)];
      return matches.map((m) => m[1]).join(",");
    };

    // Prevent spamming the local DB with duplicate idle snapshots
    const latest = await getLatestTelemetry();
    if (latest && extractIds(latest.codeSnippets) === extractIds(serializedSnippets)) {
      console.info("[Capture Loop] Sequence of Workstream UUIDs unchanged; skipping DB insert.");
      return;
    }

    await localDrizzleDb.insert(localTelemetry).values({
      branch: "feature/hackathon",
      codeSnippets: serializedSnippets,
      createdAt: new Date().toISOString(),
    });

    console.info("[Capture Loop] Telemetry saved to local_telemetry table");

    // Automatically push to cloud directly after a local commit if we have a developer identity
    if (developerId) {
      try {
        await syncTelemetryToCloud(developerId);
        window.dispatchEvent(new CustomEvent('cloud-sync-success', { detail: { time: new Date() } }));
      } catch (syncError) {
        console.error("[Capture Loop] Background cloud sync failed:", syncError);
      }
    }
  } catch (error) {
    console.error("[Capture Loop] Error in runLocalCapture:", error);
  }
}
