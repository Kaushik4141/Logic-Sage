/**
 * pieces-rag.ts
 * Location: sentinel-enterprise/backend/src/lib/pieces-rag.ts
 *
 * RAG pipeline for Pieces OS workstream data using:
 *  - LangChain MemoryVectorStore  (in-RAM, zero config)
 *  - @xenova/transformers          (local embeddings, no extra API key)
 *  - Cerebras via @ai-sdk/openai  (your existing AI setup)
 */

import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import * as fs from "fs";

// ─────────────────────────────────────────────
// 1. LOCAL EMBEDDINGS  (runs fully in-process)
// ─────────────────────────────────────────────

/**
 * Wraps @xenova/transformers so LangChain can use it.
 * Uses "all-MiniLM-L6-v2" — fast, 384-dim, great for semantic search.
 * The model is downloaded once on first use and cached locally.
 */
class LocalEmbeddings extends Embeddings {
  private pipe: any = null;

  constructor() {
    super({});
  }

  private async getPipeline(): Promise<any> {
    if (!this.pipe) {
      // Dynamic import so the heavy model loads only once
      const transformers = await import("@xenova/transformers");
      this.pipe = await transformers.pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      );
    }
    return this.pipe;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const pipe = await this.getPipeline();
    const results: number[][] = [];
    for (const text of texts) {
      const output = await pipe(text, { pooling: "mean", normalize: true });
      results.push(Array.from(output.data) as number[]);
    }
    return results;
  }

  async embedQuery(text: string): Promise<number[]> {
    const pipe = await this.getPipeline();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data) as number[];
  }
}

// ─────────────────────────────────────────────
// 2. PIECES DATA PARSER
// ─────────────────────────────────────────────

interface WorkstreamChunk {
  id: string;
  title: string;
  timestamp: string;
  content: string;
  type: "workstream";
}

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

function normalizeReferenceText(rawText: string | null | undefined): string {
  if (!rawText) return "";

  return rawText
    .replace(/\\r\\n/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericReferenceLabel(rawText: string | null | undefined): boolean {
  if (!rawText) return true;

  const normalized = normalizeReferenceText(rawText).toLowerCase();
  return [
    "os_server",
    "os server",
    "workstream",
    "reference",
    "pieces",
    "pieces context",
    "chunk",
    "server",
  ].includes(normalized);
}

function deriveReferenceTitle(title: string, snippet: string): string {
  if (!isGenericReferenceLabel(title)) {
    return normalizeReferenceText(title);
  }

  const snippetMatch = snippet.match(
    /\b(JWT|OAuth2?|Bearer token|access token|refresh token|session state|session token|AES-256|RBAC|PostgreSQL|WebSocket|REST API|API Gateway|authentication|authorization)\b/i
  );

  if (snippetMatch) {
    return normalizeReferenceText(snippetMatch[0]);
  }

  return "Technology Context";
}

function extractCitedReferenceIds(answer: string): number[] {
  const ids = [...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  return ids.filter((id, index) => Number.isFinite(id) && ids.indexOf(id) === index);
}

function slugifyTechnologyName(rawText: string): string {
  return rawText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

interface ReferenceEnrichment {
  id: number;
  technology: string;
  details: string;
  imageSlug: string;
}

async function enrichReferencesWithTechnology(
  cerebras: ReturnType<typeof createOpenAI>,
  references: RagReference[]
): Promise<RagReference[]> {
  if (references.length === 0) return references;

  const prompt = `You are enriching citation references for a developer assistant UI.

For each reference:
- identify the primary technology, protocol, product, or concept actually being referenced
- do not return source bucket names like OS_SERVER, workstream, chunk, or generic labels
- keep details short and useful, around 1 sentence
- if the technology has a recognizable Simple Icons slug, provide it
- if not, use an empty string for imageSlug

Return strict JSON only in this shape:
{"items":[{"id":1,"technology":"JWT","details":"Short explanation","imageSlug":"jsonwebtokens"}]}

References:
${JSON.stringify(
  references.map((reference) => ({
    id: reference.id,
    title: reference.title,
    snippet: reference.snippet,
  })),
  null,
  2
)}`;

  try {
    const result = await generateText({
      model: cerebras.chat(process.env.CEREBRAS_PRIMARY_MODEL ?? "llama3.1-8b"),
      prompt,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return references;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { items?: ReferenceEnrichment[] };
    const enrichments = new Map((parsed.items ?? []).map((item) => [item.id, item]));

    return references.map((reference) => {
      const enrichment = enrichments.get(reference.id);
      if (!enrichment) {
        return reference;
      }

      const cleanedTechnology = normalizeReferenceText(enrichment.technology) || deriveReferenceTitle(reference.title, reference.snippet);
      const cleanedDetails = normalizeReferenceText(enrichment.details) || reference.snippet;
      const imageSlug = slugifyTechnologyName(enrichment.imageSlug || cleanedTechnology);

      return {
        ...reference,
        title: deriveReferenceTitle(reference.title, reference.snippet),
        technology: cleanedTechnology,
        details: cleanedDetails,
        ...(imageSlug ? { imageUrl: `https://cdn.simpleicons.org/${imageSlug}` } : {}),
        imageAlt: cleanedTechnology,
      };
    });
  } catch (error) {
    console.warn("[PiecesRAG] Reference enrichment failed:", error);
    return references;
  }
}

const REDACTED = "[REDACTED_BY_SENTINEL]";

function scrubSensitiveText(rawText: string | null | undefined): string {
  if (!rawText) return "";

  let scrubbed = rawText;

  scrubbed = scrubbed.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED);
  scrubbed = scrubbed.replace(/\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, REDACTED);
  scrubbed = scrubbed.replace(/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, REDACTED);
  scrubbed = scrubbed.replace(/\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, REDACTED);
  scrubbed = scrubbed.replace(/\b(Bearer\s+)([a-zA-Z0-9\-._~+/]+=*)/gi, `$1${REDACTED}`);
  scrubbed = scrubbed.replace(/\b(?:sk|pk|rk)_(?:test|live)_[a-zA-Z0-9]{24,}\b/g, REDACTED);
  scrubbed = scrubbed.replace(
    /([a-zA-Z0-9_]*(?:password|passwd|pwd|secret|token|api_?key|db_?pass|oauth)[a-zA-Z0-9_]*\s*["']?\s*[:=]\s*["']?)([^"'\s;,<>]+)(["']?)/gi,
    (_match, prefix, value, suffix) => {
      if (typeof value !== "string" || value === REDACTED) return `${prefix}${value}${suffix}`;

      const lowerValue = value.toLowerCase();
      if (["true", "false", "null", "undefined"].includes(lowerValue)) {
        return `${prefix}${value}${suffix}`;
      }

      if (/^\d+$/.test(value) && value.length < 4) {
        return `${prefix}${value}${suffix}`;
      }

      return `${prefix}${REDACTED}${suffix}`;
    }
  );
  scrubbed = scrubbed.replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, REDACTED);
  scrubbed = scrubbed.replace(/\/Users\/[^\s/]+/g, REDACTED);

  return scrubbed;
}

/**
 * Parses Pieces OS workstream format.
 * Splits on the "---" separator between entries.
 * Accepts:
 *   - A raw workstream string (from Pieces API / in-memory)
 *   - A file path to a .txt / .json file on disk
 *   - An array of workstream objects (from Pieces SDK)
 */
function parsePiecesData(input: string | object[]): WorkstreamChunk[] {
  let raw = "";

  if (typeof input === "string") {
    if (input.trim() === "") return [];
    if (fs.existsSync(input)) {
      raw = fs.readFileSync(input, "utf-8");
    } else {
      raw = input;
    }
  } else if (Array.isArray(input)) {
    if (input.length === 0) return [];
    raw = input
      .map((item: any) =>
        typeof item === "string" ? item : JSON.stringify(item)
      )
      .join("\n-----------------------------------------------\n");
  }

  // Split on the separator line
  const blocks = raw
    .split("-----------------------------------------------")
    .map((b) => b.trim())
    .filter((b) => b.length > 50); // skip empty / tiny blocks

  return blocks.map((block, i) => {
    // Extract title from "LIVE WORKSTREAM CONTEXT: <Title>"
    const titleMatch = block.match(/LIVE WORKSTREAM CONTEXT:\s*(.+)/);
    const title = titleMatch?.[1]
      ? titleMatch[1].trim()
      : `Workstream ${i + 1}`;

    // Extract timestamp
    const tsMatch = block.match(/Timestamp:\s*(.+)/);
    const timestamp = tsMatch?.[1] ? tsMatch[1].trim() : "unknown";

    // Strip header lines, keep the rest
    const content = block
      .replace(/---\s*LIVE WORKSTREAM CONTEXT:.*/, "")
      .replace(/Timestamp:.*/, "")
      .trim();

    return {
      id: `ws_${i}`,
      title,
      timestamp,
      content,
      type: "workstream" as const,
    };
  });
}

/**
 * Splits a single large workstream block into ~500-char chunks
 * for more precise retrieval.
 */
function chunkWorkstream(ws: WorkstreamChunk, chunkSize = 500): Document[] {
  const docs: Document[] = [];
  const words = ws.content.split(/\s+/);
  let current = "";
  let part = 0;

  for (const word of words) {
    if ((current + " " + word).length > chunkSize && current.length > 0) {
      docs.push(
        new Document({
          pageContent: current.trim(),
          metadata: {
            id: `${ws.id}_p${part}`,
            title: ws.title,
            timestamp: ws.timestamp,
            type: ws.type,
          },
        })
      );
      current = word;
      part++;
    } else {
      current += (current ? " " : "") + word;
    }
  }

  if (current.trim()) {
    docs.push(
      new Document({
        pageContent: current.trim(),
        metadata: {
          id: `${ws.id}_p${part}`,
          title: ws.title,
          timestamp: ws.timestamp,
          type: ws.type,
        },
      })
    );
  }

  return docs;
}

// ─────────────────────────────────────────────
// 3. MAIN RAG CLASS
// ─────────────────────────────────────────────

export class PiecesRAG {
  private vectorStore: MemoryVectorStore | null = null;
  private embeddings: LocalEmbeddings;
  private cerebras: ReturnType<typeof createOpenAI>;
  private isReady = false;
  private docCount = 0;

  constructor() {
    this.embeddings = new LocalEmbeddings();
    // Re-use your existing Cerebras OpenAI-compat provider
    this.cerebras = createOpenAI({
      baseURL: "https://api.cerebras.ai/v1",
      apiKey: process.env.CEREBRAS_API_KEY ?? "",
    });
  }

  /**
   * Index Pieces data from scratch. Call once on startup.
   * Accepts raw workstream text, a file path, or an SDK array.
   */
  async index(input: string | object[]): Promise<void> {
    console.log("🔍 [PiecesRAG] Parsing Pieces workstream data...");
    const workstreams = parsePiecesData(input);

    if (workstreams.length === 0) {
      console.warn(
        "⚠️  [PiecesRAG] No workstream blocks found — store will be empty until data arrives."
      );
      // Still mark as ready so the server can accept push updates
      this.isReady = true;
      return;
    }

    console.log(`📦 [PiecesRAG] Found ${workstreams.length} workstream blocks`);

    const allDocs: Document[] = [];
    for (const ws of workstreams) {
      allDocs.push(...chunkWorkstream(ws));
    }

    console.log(
      `✂️  [PiecesRAG] Split into ${allDocs.length} chunks — embedding now...`
    );

    this.vectorStore = await MemoryVectorStore.fromDocuments(
      allDocs,
      this.embeddings
    );
    this.docCount = allDocs.length;
    this.isReady = true;
    console.log(`✅ [PiecesRAG] Ready — ${allDocs.length} chunks in RAM`);
  }

  /**
   * Incrementally add new Pieces data without rebuilding the entire index.
   * Call this from the 5-minute poller so the store stays fresh.
   */
  async addContext(input: string | object[]): Promise<void> {
    if (!this.vectorStore) {
      // First time — do a full index instead
      return this.index(input);
    }

    const workstreams = parsePiecesData(input);
    if (workstreams.length === 0) return;

    const allDocs: Document[] = [];
    for (const ws of workstreams) {
      allDocs.push(...chunkWorkstream(ws));
    }

    await this.vectorStore.addDocuments(allDocs);
    this.docCount += allDocs.length;
    console.log(
      `➕ [PiecesRAG] Added ${allDocs.length} new chunks (total: ${this.docCount})`
    );
  }

  /**
   * Retrieve top-K relevant chunks for a query.
   * Used internally by ask() and also exposed so index.ts
   * can inject RAG context into the existing /api/collaborate prompt.
   */
  async retrieve(
    query: string,
    topK = 5
  ): Promise<{ content: string; metadata: Record<string, unknown> }[]> {
    if (!this.vectorStore) return [];

    const results = await this.vectorStore.similaritySearchWithScore(
      query,
      topK
    );

    return results
      .filter(([, score]: [Document, number]) => score > 0.2) // drop very irrelevant chunks
      .map(([doc, score]: [Document, number]) => ({
        content: doc.pageContent,
        metadata: {
          ...doc.metadata,
          score: score.toFixed(3),
        },
      }));
  }

  /**
   * Full RAG query → Cerebras answer + references.
   * Returns { text, references } so the frontend can render citation chips.
   */
  async ask(
    searchQuery: string,
    fullQuery?: string
  ): Promise<{ text: string; references: RagReference[] }> {
    if (!this.isReady) {
      return { text: "RAG pipeline not ready yet. Please wait for indexing to complete.", references: [] };
    }

    const chunks = await this.retrieve(searchQuery, 8);

    if (chunks.length === 0) {
      return { text: "I couldn't find relevant context in your Pieces data for that question.", references: [] };
    }

    const references: RagReference[] = chunks.map((c, index) => ({
      id: index + 1,
      title: deriveReferenceTitle(
        normalizeReferenceText(scrubSensitiveText(String(c.metadata["title"] ?? "Reference"))),
        normalizeReferenceText(
          scrubSensitiveText(
            c.content.substring(0, 220) + (c.content.length > 220 ? "..." : "")
          )
        )
      ),
      timestamp: String(c.metadata["timestamp"] ?? "unknown"),
      snippet: normalizeReferenceText(
        scrubSensitiveText(
          c.content.substring(0, 220) + (c.content.length > 220 ? "..." : "")
        )
      ),
      score: String(c.metadata["score"] ?? "0"),
      source: "pieces",
    }));

    const context = chunks
      .map(
        (c, i) =>
          `[${i + 1}] From "${scrubSensitiveText(String(c.metadata["title"] ?? "Unknown"))}" (${c.metadata["timestamp"]}):\n${scrubSensitiveText(c.content)}`
      )
      .join("\n\n");

    const prompt = `You are Sentinel, an AI assistant with access to the developer's recent activity from Pieces OS.

Use the Pieces context below to understand the developer's local situation and answer the user's question. Provide a helpful, clear response. Synthesize the information across multiple sources if applicable.
If the answer isn't in the context, say so clearly.
Focus on technical explanation only. Do not reveal personal details, usernames, emails, phone numbers, local machine paths, secrets, or private identifiers from the context even if they appear there.
Use the numbered Pieces context for citations.
When you make a factual or technology-specific claim supported by the context, cite it inline with the matching square-bracket reference number like [1] or [2].
Use citations sparingly and only when they help support the final answer.
Do not invent references, and do not cite anything outside the numbered Pieces context block.
If multiple sources support the same sentence, cite multiple references like [1][3].
If the user asks for an image, screenshot, or visual reference and the context does not contain one, say that the available context does not include an image.
Do not quote or dump raw context chunks. Write a normal clean answer for the user.

--- PIECES CONTEXT ---
${context}
--- END PIECES CONTEXT ---

User query details: 
${fullQuery || searchQuery}

Answer:`;

    const result = await generateText({
      model: this.cerebras.chat(
        process.env.CEREBRAS_PRIMARY_MODEL ?? "llama3.1-8b"
      ),
      prompt,
    });

    const answerText = result.text ?? "No response from Cerebras.";
    const citedReferenceIds = extractCitedReferenceIds(answerText);
    const usedReferences =
      citedReferenceIds.length > 0
        ? references.filter((reference) => citedReferenceIds.includes(reference.id))
        : [];

    const enrichedReferences = await enrichReferencesWithTechnology(
      this.cerebras,
      usedReferences
    );

    return { text: answerText, references: enrichedReferences };
  }

  /** Health check — used by /api/rag/status */
  status() {
    return {
      ready: this.isReady,
      chunks: this.docCount,
    };
  }
}

// ─────────────────────────────────────────────
// 4. SINGLETON  (imported everywhere)
// ─────────────────────────────────────────────

export const piecesRAG = new PiecesRAG();
