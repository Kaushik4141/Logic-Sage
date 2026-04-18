# Sentinel Enterprise Deep Dive

This is the third and deepest documentation layer. It is intended for engineers who need to understand the exact behavior of the RAG pipeline, Cerebras prompting, validation controls, and contextual chat experience.

## 1. Why This Layer Exists

A new developer should not need to understand vector stores, embeddings, or citation filtering just to understand the product. That is why the documentation is layered.

This document answers the deeper questions:

- how is Pieces context collected?
- how is that context chunked and indexed?
- how is Cerebras used?
- what does validation actually mean in this system?
- how does the UI expose deeper context safely?

## 2. The Three Runtime Stages

The intelligence path in the current implementation has three functional stages.

### Stage 1: Retrieval with RAG

Files:

- `backend/src/lib/pieces.ts`
- `backend/src/lib/pieces-rag.ts`

What happens:

1. The backend fetches recent Pieces workstream events.
2. Raw event data is normalized into a text format that the parser understands.
3. Each workstream block is split into smaller chunks.
4. Chunks are embedded with `@xenova/transformers` using `Xenova/all-MiniLM-L6-v2`.
5. The embeddings are stored in a LangChain `MemoryVectorStore`.
6. When a question arrives, the system runs semantic similarity search and keeps the top relevant chunks.

Why it matters:

- the model does not answer from general memory alone
- the answer is grounded in recent developer context
- references can be traced back to retrieved chunks

Current implementation detail:

- the vector store is in memory, so it is fast and simple but not durable across restarts

### Stage 2: Generation with Cerebras

Files:

- `backend/src/index.ts`
- `backend/src/lib/pieces-rag.ts`

What happens:

1. Retrieved chunks are converted into a numbered context block.
2. The prompt tells the model to answer only from that context.
3. The prompt requires inline citations like `[1]` and `[2]`.
4. The backend sends the prompt through the OpenAI-compatible Cerebras provider.
5. The response text becomes the main chat answer.

Why it matters:

- the model is used as the reasoning and explanation layer
- citations tie the answer back to retrieved context
- the same provider is also used to enrich reference cards with technology labels and descriptions

Current model configuration:

- primary model defaults to `llama3.1-8b`
- fallback model for the developer-brief route also defaults to `llama3.1-8b`
- both are configurable through environment variables

### Stage 3: Validation and Safe Presentation

Files:

- `backend/src/index.ts`
- `backend/src/lib/pieces-rag.ts`
- `frontend/src/App.tsx`

Validation in this system is not a separate fact-check engine. It is a chain of controls:

1. sensitive text is scrubbed before or during prompt construction
2. the model is instructed not to reveal secrets or personal identifiers
3. only retrieved chunks are available for citation
4. only cited references are returned to the UI
5. the UI renders the references as inspectable context cards

Why it matters:

- the answer is easier to trust because it is not opaque
- developers can move from summary to evidence
- enterprise safety is handled as a system behavior, not a single prompt trick

## 3. Exact RAG Lifecycle

### Startup Indexing

At backend startup:

1. `initRAG()` calls `getRecentCodeSnippets()`
2. the result is passed to `piecesRAG.index(...)`
3. the parser converts input into `WorkstreamChunk` objects
4. `chunkWorkstream(...)` creates smaller `Document` entries
5. `MemoryVectorStore.fromDocuments(...)` builds the index

Operational behavior:

- if no workstream blocks are found, the backend still marks RAG as ready
- this prevents the server from staying blocked forever waiting for Pieces data

### Incremental Refresh

Every 5 minutes:

1. the backend fetches new Pieces data
2. `piecesRAG.addContext(...)` parses and chunks new data
3. new documents are added into the existing vector store

Operational benefit:

- the index can evolve without full rebuild on each refresh

### Query-Time Retrieval

When a question arrives:

1. `/api/collaborate` receives the user request
2. the question is extracted from `user_query`, `query`, or `userMessage`
3. `piecesRAG.ask(question, augmentedQuery)` is called
4. `retrieve(question, 8)` runs similarity search
5. low-scoring results are dropped
6. the remaining chunks become numbered references and prompt context

Important nuance:

- the retrieval search currently uses `searchQuery`
- the fuller `augmentedQuery` is included in prompting for explanation context, not for similarity search itself

## 4. Pieces Context Ingestion

There are currently two context ingestion strategies.

### Backend Pieces Ingestion

File:

- `backend/src/lib/pieces.ts`

Behavior:

- calls `http://localhost:39300/workstream_events`
- sorts newest first
- limits processing to the latest 50 events
- converts events into a text format consumable by the RAG parser

Reason for the limit:

- avoid very large startup embedding workloads

### Frontend Pieces Ingestion

File:

- `frontend/src/lib/pieces.ts`

Behavior:

- uses the official Pieces SDK
- fetches workstream summaries
- deep-fetches annotations
- deduplicates annotation IDs and repeated text
- builds context blocks for local storage and chat payload assembly

Why this matters:

- the desktop app has a richer local view for telemetry capture
- the backend has a simpler ingestion path for server-side RAG

## 5. How the Chat Experience Works

The product intentionally exposes context in layers.

### Outer Experience: Summary

The summary tab is the quick-understanding layer.

Its job:

- orient the developer quickly
- explain what the system is doing
- reduce the amount of knowledge needed before using the app

### Inner Experience: Chat

The chat tab is the deeper-understanding layer.

Its job:

- answer a direct question
- allow follow-up questions on the same topic
- expose supporting references
- convert citations into visible technology cards

Chat flow:

1. user submits a question
2. frontend reads the latest local telemetry row
3. frontend sends request to `/api/collaborate`
4. backend returns answer text plus references
5. frontend parses citation markers such as `[1][2]`
6. frontend renders compact citation chips inline
7. frontend renders detailed technology cards below the answer

This is how the user goes from short answer to deeper context without leaving the conversation.

## 6. How References Are Built

References are created from retrieved chunks before the final answer is returned.

The backend:

1. creates numbered references from retrieved chunk metadata
2. scrubs the title and snippet
3. asks Cerebras to enrich references with technology labels and descriptions
4. extracts which citation IDs actually appear in the answer
5. returns only the cited references

This behavior is important because it keeps the response focused. The user sees the evidence actually used by the answer, not an arbitrary dump of all retrieved chunks.

## 7. What Validation Means Here

In many teams, "validation" implies a second model or deterministic rules engine that verifies generated claims. That is not the current architecture.

In Sentinel Enterprise today, validation means:

- input sanitization
- controlled retrieval
- constrained prompt instructions
- citation-based answer grounding
- reference exposure in the UI

Sensitive data scrubbing currently targets:

- email addresses
- phone numbers
- AWS-style keys
- JWT-like tokens
- bearer tokens
- common API key formats
- password and secret assignment patterns
- local user path patterns

This makes the system safer for enterprise use, but it is still an area that can be extended in future versions with stronger policy engines or post-answer verification.

## 8. Local-First Storage and Enterprise Sync

### Local Storage

File:

- `frontend/src/lib/localDb.ts`

Local SQLite tables include:

- `local_logs`
- `local_context_captures`
- `local_telemetry`

Why local storage exists:

- fast access to recent context
- resilience if cloud connectivity is slow
- reduced dependency on constant remote round-trips

### Enterprise Sync

Files:

- `frontend/src/lib/cloudSync.ts`
- `edge-api/src/index.ts`

Flow:

1. latest local telemetry row is loaded
2. snippets are parsed from storage
3. telemetry is sent to `/api/sync`
4. Cloudflare Worker validates the request shape
5. D1 stores the telemetry record

Why this split is useful:

- local system remains fast and context-rich
- enterprise layer still gets shared history and reporting data

## 9. Environment and Operational Dependencies

The system depends on:

- Pieces OS running locally on port `39300`
- Cerebras API access through `CEREBRAS_API_KEY`
- backend environment configuration for model names and allowed origins
- Cloudflare Worker availability for enterprise sync and history

Operational takeaway:

- if Pieces is unavailable, capture and RAG quality degrade first
- if Cerebras is unavailable, AI generation fails next
- if edge services are unavailable, enterprise sync features degrade but local experience can still function

## 10. Recommended Improvements for a Mature Enterprise Version

The current design is strong for a prototype and already professional enough to explain clearly, but these are the next likely upgrades:

1. unify frontend and backend Pieces ingestion behind one normalized context contract
2. persist embeddings or retrieval state instead of rebuilding in memory each process lifecycle
3. add explicit answer verification or policy checks after generation
4. version prompt templates and retrieval settings
5. add observability for retrieval hit rate, citation coverage, and scrubber effectiveness

## 11. Practical Mental Model for New Developers

If you want one sentence per layer, use this:

- Pieces tells Sentinel what the developer has been doing
- RAG finds which of that context matters for the question
- Cerebras explains it in natural language
- validation keeps the answer safe, grounded, and inspectable
- chat is the deeper exploration surface built on top of that flow
