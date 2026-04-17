# SENTINEL ARCHITECTURE & DATA FLOW

## Component Breakdown

### 1. Tauri Frontend (Local Desktop)
- Responsible for the UI (Live Context Sidebar, AI Chat).
- Runs `SQLite` locally to cache snippets and AI blueprints.
- Communicates directly with Pieces OS (`localhost:1000`) via the Pieces SDK.

### 2. Pieces OS (The Local Sensor)
- Runs locally in the background.
- Captures active window, clipboard, and IDE context.
- We pull this data via `AssetsApi` and `WorkstreamSummariesApi`.

### 3. Node.js Backend (The Orchestrator)
- Receives sanitized local context from the Tauri app.
- Runs the `Regex Scrubber` to ensure Zero-Leak compliance.
- Prompts the LLM via `Vercel AI SDK` to generate "Developer Blueprints" or answer cross-team queries.
- Connects to the Cloud Postgres DB to store non-sensitive analytics (Manager Dashboard).

## Core Data Flows
1. **Cross-Team Query:** Dev A asks a question -> Tauri fetches Dev B's mock context -> Sends to Node Backend -> Scrubber -> Vercel AI -> Streams answer back to Tauri.
2. **Contextual Ticket Hydration:** Jira Webhook triggers Node Backend -> Backend queries Postgres for Dev A's "Blueprint" -> Sends push notification to Dev B's Tauri app.
