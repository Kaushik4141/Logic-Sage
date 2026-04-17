# SENTINEL ARCHITECTURE & DATA FLOW

## Component Breakdown

## Database Tooling Rule (Strict)
- Use Drizzle ORM strictly.
- For the Cloudflare D1 backend, use the `drizzle-orm/d1` adapter.
- For the Tauri frontend local SQLite database, use the `drizzle-orm/sqlite-proxy` adapter to route queries through `tauri-plugin-sql`.
- Share one central `schema.ts` file across both local and cloud database layers.

### 1. Tauri Frontend (Local Desktop)
- Responsible for the UI (Live Context Sidebar, AI Chat).
- Runs local-first `SQLite` via `tauri-plugin-sql` (`sentinel-local.db`) to cache raw telemetry, AI chat history, and immediate context for offline speed.
- Communicates directly with Pieces OS (`localhost:39300`) via the Pieces SDK.

### 2. Pieces OS (The Local Sensor)
- Runs locally in the background.
- Captures active window, clipboard, and IDE context.
- We pull this data via `AssetsApi` and `WorkstreamSummariesApi`.

### 3. Node.js Backend (The Orchestrator)
- Receives sanitized local context from the Tauri app.
- Runs the `Regex Scrubber` to ensure Zero-Leak compliance.
- Prompts the LLM via `Vercel AI SDK` to generate "Developer Blueprints" or answer cross-team queries.
- Routes sync traffic to a Cloudflare Worker that writes to Cloudflare D1.
- Stores only "Developer Blueprints" and telemetry metadata in cloud storage for the enterprise dashboard.

## Core Data Flows
1. **Cross-Team Query:** Dev A asks a question -> Tauri fetches Dev B's mock context -> Sends to Node Backend -> Scrubber -> Vercel AI -> Streams answer back to Tauri.
2. **Contextual Ticket Hydration:** Jira Webhook triggers Node Backend -> Backend queries Cloudflare D1 (via Worker) for Dev A's "Blueprint" -> Sends push notification to Dev B's Tauri app.
