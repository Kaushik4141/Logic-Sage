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
   * Full RAG query → Cerebras answer.
   * Standalone: retrieves chunks, builds prompt, calls Cerebras.
   */
  async ask(searchQuery: string, fullQuery?: string): Promise<string> {
    if (!this.isReady) {
      return "RAG pipeline not ready yet. Please wait for indexing to complete.";
    }

    const chunks = await this.retrieve(searchQuery, 5);

    if (chunks.length === 0) {
      return "I couldn't find relevant context in your Pieces data for that question.";
    }

    const context = chunks
      .map(
        (c, i) =>
          `[${i + 1}] From "${c.metadata["title"]}" (${c.metadata["timestamp"]}):\n${c.content}`
      )
      .join("\n\n");

    const prompt = `You are Sentinel, an AI assistant with access to the developer's recent activity from Pieces OS.

Use the context below to answer the user's question. Be specific, cite which workstream the info came from, and be concise.
If the answer isn't in the context, say so clearly.

--- RELEVANT CONTEXT ---
${context}
--- END CONTEXT ---

User query details: 
${fullQuery || searchQuery}

Answer:`;

    const result = await generateText({
      model: this.cerebras.chat(
        process.env.CEREBRAS_PRIMARY_MODEL ?? "llama3.1-8b"
      ),
      prompt,
    });

    return result.text ?? "No response from Cerebras.";
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
