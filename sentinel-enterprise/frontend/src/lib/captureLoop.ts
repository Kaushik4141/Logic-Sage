import { createTables, localTelemetry, localDrizzleDb } from "./localDb";
import { getRecentCodeSnippets } from "./pieces";

export async function runLocalCapture(): Promise<void> {
  try {
    await createTables();

    const piecesData = await getRecentCodeSnippets();
    console.log("Raw Pieces Data:", piecesData);

    const serializedSnippets = JSON.stringify(piecesData);

    await localDrizzleDb.insert(localTelemetry).values({
      branch: "feature/hackathon",
      codeSnippets: serializedSnippets,
      createdAt: new Date().toISOString(),
    });

    console.info("[Capture Loop] Telemetry saved to local_telemetry table");
  } catch (error) {
    console.error("[Capture Loop] Error in runLocalCapture:", error);
  }
}
