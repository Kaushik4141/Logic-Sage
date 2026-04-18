/**
 * pieces.ts
 * Location: sentinel-enterprise/backend/src/lib/pieces.ts
 *
 * Fetches recent workstream activity from your local Pieces OS instance.
 * Pieces OS exposes a REST API on http://localhost:1000 by default.
 *
 * Call getRecentCodeSnippets() at startup and every 5 minutes to
 * keep the PiecesRAG vector store fresh.
 */

const PIECES_BASE_URL =
  process.env.PIECES_URL ?? "http://localhost:39300";

/**
 * Fetches the most recent workstream context from Pieces OS.
 * Returns a raw string in the "LIVE WORKSTREAM CONTEXT" format
 * that parsePiecesData() in pieces-rag.ts knows how to parse.
 *
 * Returns an empty string if Pieces OS is not running — the RAG
 * store will remain in whatever state it was last updated to.
 */
export async function getRecentCodeSnippets(): Promise<string> {
  try {
    // Pieces OS /workstream_events returns recent developer activity.
    // Adjust the path below to match your actual Pieces SDK/API version.
    const res = await fetch(`${PIECES_BASE_URL}/workstream_events`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000), // 5 s timeout
    });

    if (!res.ok) {
      console.warn(
        `[Pieces] HTTP ${res.status} from ${PIECES_BASE_URL}/workstream_events`
      );
      return "";
    }

    const json = (await res.json()) as any;

    // Pieces SDK returns { iterable: [...] } for list endpoints
    const events: any[] = Array.isArray(json)
      ? json
      : (json?.iterable ?? []);

    if (events.length === 0) return "";

    // Sort newest first and limit to the last 50 events so we don't 
    // freeze the Node.js process embedding 19k+ chunks at startup.
    const sortedEvents = events.sort((a, b) => {
      const tsA = a?.timestamp?.value ?? a?.created?.value ?? 0;
      const tsB = b?.timestamp?.value ?? b?.created?.value ?? 0;
      return new Date(tsB).getTime() - new Date(tsA).getTime();
    }).slice(0, 50);

    // Serialise each event into the workstream text format so
    // parsePiecesData() can split and embed them correctly.
    const blocks = sortedEvents.map((evt: any, i: number) => {
      const title =
        evt?.application?.name ??
        evt?.workstream_summary?.name ??
        `Event ${i + 1}`;
      const ts: string =
        evt?.timestamp?.value ?? evt?.created?.value ?? "unknown";
      // Grab whatever text content is available
      const body: string =
        evt?.workstream_summary?.raw_content ??
        evt?.content ??
        JSON.stringify(evt);

      return [
        `--- LIVE WORKSTREAM CONTEXT: ${title}`,
        `Timestamp: ${ts}`,
        body,
      ].join("\n");
    });

    return blocks.join(
      "\n-----------------------------------------------\n"
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Pieces] Could not reach Pieces OS: ${msg}`);
    return "";
  }
}
