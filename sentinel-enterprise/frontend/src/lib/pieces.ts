import {
  AnnotationApi,
  Configuration,
  WellKnownApi,
  WorkstreamSummariesApi,
  type WorkstreamSummary,
  WorkstreamSummaryApi,
} from "@pieces.app/pieces-os-client";

const PIECES_OS_BASE_URL = "http://localhost:39300";

export type PiecesConnectionStatus = {
  connected: boolean;
  baseUrl: string;
  health?: string;
  error?: string;
};

export type CollaboratePayload = {
  user_query: string;
  local_context: {
    error_log: string;
    teammate_recent_code: string;
  };
  branch: string;
};

export async function checkPiecesConnection(): Promise<PiecesConnectionStatus> {
  const api = new WellKnownApi(
    new Configuration({
      basePath: PIECES_OS_BASE_URL,
    }),
  );

  try {
    const health = await api.getWellKnownHealth();

    return {
      connected: true,
      baseUrl: PIECES_OS_BASE_URL,
      health,
    };
  } catch (error) {
    return {
      connected: false,
      baseUrl: PIECES_OS_BASE_URL,
      error: error instanceof Error ? error.message : "Unknown Pieces OS connection error",
    };
  }
}

function createPiecesConfig(): Configuration {
  return new Configuration({
    basePath: PIECES_OS_BASE_URL,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

function toMillis(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function extractSummaryText(summary: WorkstreamSummary | undefined): string | null {
  if (!summary) {
    return null;
  }

  const annotationText =
    summary.annotations?.iterable
      ?.map((annotation) => (annotation as any).text?.trim() ?? annotation.reference?.text?.trim())
      .filter((text): text is string => Boolean(text)) ?? [];

  if (annotationText.length > 0) {
    return annotationText.join("\n\n");
  }

  const name = summary.name?.trim();
  return name && name.length > 0 ? name : null;
}

function condenseText(text: string | null | undefined, maxLength = 2_000): string {
  if (!text) {
    return "";
  }

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

/**
 * Fetches the most recent workstream summaries from Pieces OS.
 *
 * Strategy (three-phase):
 *  1. Lightweight snapshot — get 1500+ summaries, sort, pick top 5.
 *  2. Per-summary deep fetch — get the summary with its annotation UUIDs
 *     from the `annotations.indices` map and tag UUIDs from `tags.indices`.
 *  3. Per-annotation fetch — use AnnotationApi to fetch each annotation by
 *     UUID, which returns the full Annotation model with `.text` directly.
 */
export async function getRecentCodeSnippets(): Promise<string[]> {
  const config = createPiecesConfig();
  const summariesApi = new WorkstreamSummariesApi(config);
  const summaryApi = new WorkstreamSummaryApi(config);
  const annotationApi = new AnnotationApi(config);

  try {
    // ── Phase 1: Lightweight snapshot ──
    const workstreamData = await summariesApi.workstreamSummariesSnapshot({
      transferables: false,
    });
    const summaries = workstreamData?.iterable ?? [];

    console.log("[Sentinel WPE] Total Workstream Summaries found:", summaries.length);

    if (summaries.length === 0) {
      return ["No active workflow context found for this developer."];
    }

    // Sort newest-first, take top 5
    const sorted = [...summaries]
      .sort((a, b) => {
        const t = (s?: { value?: Date | string | number }) => {
          if (!s?.value) return 0;
          const d = new Date(s.value);
          return isNaN(d.getTime()) ? 0 : d.getTime();
        };
        return (t(b.updated) || t(b.created)) - (t(a.updated) || t(a.created));
      })
      .slice(0, 5);

    // Global dedup: track annotation IDs + text we've already seen across summaries
    const seenAnnotationIds = new Set<string>();
    const seenTexts = new Set<string>();

    // ── Phase 2 + 3: Deep-fetch each summary sequentially to enforce deduplication ──
    // We use a for...of loop instead of Promise.all to prevent race conditions 
    // where multiple summaries check the seenAnnotationIds Set at the same time.
    const formatTime = (s: any) => {
      const val = s?.updated?.value ?? s?.created?.value;
      try {
        return val ? new Date(val).toLocaleString() : "";
      } catch {
        return "";
      }
    };

    const contextBlocks: string[] = [];
    for (const lightSummary of sorted) {
      let title = lightSummary.name?.trim() || "Uncategorized Activity";
      let timestamp = formatTime(lightSummary);
      let detailedText = "";
      let tagLine = "";

      try {
        // Phase 2: Get the summary with its indices maps
        const deep = await summaryApi.workstreamSummariesSpecificWorkstreamSummarySnapshot({
          workstreamSummary: lightSummary.id,
          transferables: true,
        });

        if (deep.name?.trim()) title = deep.name.trim();
        const deepTime = formatTime(deep);
        if (deepTime) timestamp = deepTime;

        // Extract tag text — try iterable first, then fall back to indices
        const tags = (deep.tags?.iterable ?? [])
          .map((tag) => (tag as any).text?.trim())
          .filter(Boolean);
        if (tags.length > 0) tagLine = `Tags: ${tags.join(", ")}`;

        // Phase 3: Fetch annotations by UUID from the indices map
        // Skip any annotation IDs we've already fetched for a previous summary
        const allAnnotationIds = Object.keys(deep.annotations?.indices ?? {});
        const newAnnotationIds = allAnnotationIds.filter((id) => !seenAnnotationIds.has(id));

        // Mark them as seen immediately so subsequent summaries don't fetch them
        for (const id of newAnnotationIds) seenAnnotationIds.add(id);

        if (newAnnotationIds.length > 0) {
          console.log(`[Sentinel WPE] Fetching ${newAnnotationIds.length} new annotations for "${title}" (${allAnnotationIds.length - newAnnotationIds.length} skipped as dupes)`);

          // Fetch up to 3 NEW annotations in parallel
          const annotationResults = await Promise.all(
            newAnnotationIds.slice(0, 3).map(async (annId) => {
              try {
                const fullAnnotation = await annotationApi.annotationSpecificAnnotationSnapshot({
                  annotation: annId,
                });
                return fullAnnotation.text || null;
              } catch {
                console.warn(`[Sentinel WPE] Could not fetch annotation ${annId}`);
                return null;
              }
            }),
          );

          // Filter out nulls + text we've already seen in a previous summary
          const texts = annotationResults
            .filter((t): t is string => Boolean(t))
            .filter((t) => {
              if (seenTexts.has(t)) return false;
              seenTexts.add(t);
              return true;
            });

          if (texts.length > 0) {
            detailedText = texts.join("\n\n");
          }

          console.log(`[Sentinel WPE] Deep summary "${title}":`, {
            annotationIdsFound: allAnnotationIds.length,
            newFetched: newAnnotationIds.length,
            uniqueTexts: texts.length,
            hasText: detailedText.length > 0,
            preview: detailedText.substring(0, 80),
          });
        }
      } catch (deepErr) {
        console.warn(`[Sentinel WPE] Could not deep-fetch summary ${lightSummary.id}:`, deepErr);
      }

      if (!detailedText) {
        detailedText = "Continuous telemetry tracked by Pieces OS Pattern Engine.";
      }

      // ── Assemble Block ──
      const lines = [
        `--- LIVE WORKSTREAM CONTEXT: ${title} ---`,
        `Summary ID: ${lightSummary.id}`,
        timestamp ? `Timestamp: ${timestamp}` : "",
        tagLine,
        "",
        detailedText,
        "-----------------------------------------------",
      ].filter((l) => l !== "");

      contextBlocks.push("\n" + lines.join("\n") + "\n");
    }

    console.log("[Sentinel WPE] Context blocks built:", contextBlocks.length);
    return contextBlocks;

  } catch (error) {
    console.error("[Sentinel WPE Sensor] Failed to fetch live workstream:", error);
    return ["Error retrieving live context."];
  }
}
export async function getRecentWorkflowSummary(): Promise<string | null> {
  const api = new WorkstreamSummariesApi(createPiecesConfig());
  const to = new Date();
  const from = new Date(to.getTime() - 2 * 60 * 60 * 1000);
  const cutoff = from.getTime();

  try {
    const generated = await api.workstreamSummariesCreateAutogeneratedWorkstreamSummary({
      autoGeneratedWorkstreamSummaryInput: {
        anonymousRanges: [
          {
            from: { value: from },
            to: { value: to },
            between: true,
          },
        ],
      },
    });

    const generatedText = extractSummaryText(generated);
    if (generatedText) {
      return generatedText;
    }
  } catch {
    // Fallback to snapshot below.
  }

  try {
    const snapshot = await api.workstreamSummariesSnapshot({ transferables: true });
    const summaries = snapshot?.iterable ?? [];

    if (summaries.length === 0) {
      return null;
    }

    const recentSummary = summaries
      .slice()
      .sort((a, b) => toMillis(b.updated?.value) - toMillis(a.updated?.value))
      .find((summary) => {
        const updated = toMillis(summary.updated?.value);
        const created = toMillis(summary.created?.value);
        return Math.max(updated, created) >= cutoff;
      });

    return extractSummaryText(recentSummary);
  } catch {
    return null;
  }
}

export async function packageLocalContext(
  userQuery: string,
  branchName: string,
): Promise<CollaboratePayload> {
  const [snippets, workflowSummary] = await Promise.all([
    getRecentCodeSnippets(),
    getRecentWorkflowSummary(),
  ]);

  const condensedSnippets = snippets
    .map((snippet) => condenseText(snippet, 3_000))
    .filter((snippet) => snippet.length > 0);

  return {
    user_query: condenseText(userQuery, 500),
    local_context: {
      error_log: condenseText(workflowSummary, 1_500) || "No recent workflow summary available.",
      teammate_recent_code:
        condensedSnippets[0] ?? "No recent code snippet available from Pieces OS.",
    },
    branch: condenseText(branchName, 200),
  };
}
