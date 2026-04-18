# Sentinel Enterprise Architecture

This document is the middle layer of the documentation set. It explains how the system works end to end without requiring readers to understand every implementation detail.

If you only need the big picture, read the root `README.md`.  
If you need exact implementation behavior for RAG, Cerebras, validation, and contextual chat, continue to `SYSTEM_DEEP_DIVE.md`.

## 1. Executive Summary

Sentinel Enterprise is a local-first developer intelligence platform. It reads live developer activity from Pieces OS, keeps a local telemetry cache on the desktop, retrieves the most relevant context through RAG, asks a Cerebras model to explain or summarize that context, and returns a professional answer with references that developers can inspect more deeply.

The product intentionally has two levels of understanding:

- the outer layer is a summary that helps anyone understand what matters quickly
- the inner layer is a deeper chat and reference experience for technical follow-up

## 2. System Layers

### Layer A: Experience Layer

The Tauri desktop frontend is the interface developers actually use.

Responsibilities:

- renders the summary workspace
- renders the context-aware chat experience
- stores recent telemetry in local SQLite
- triggers capture from Pieces OS
- sends enterprise sync payloads to the cloud
- sends chat questions to the local backend

Key outcomes:

- low-latency local experience
- offline-friendly local persistence
- visible references and technology cards in chat

### Layer B: Intelligence Layer

The Node backend is the orchestration and reasoning layer.

Responsibilities:

- initializes the Pieces-based RAG index
- refreshes the index on a timer
- retrieves the most relevant context chunks for a question
- scrubs sensitive information before model exposure
- prompts the Cerebras model with grounded context
- returns answer text plus structured references

This is the layer that turns raw activity into explainable AI output.

### Layer C: Enterprise Platform Layer

The Cloudflare Worker and D1 database provide shared enterprise services.

Responsibilities:

- store synced telemetry centrally
- store blueprint and history data
- support login, invitation, and team membership flows
- expose recent history for enterprise briefing features

This layer is for persistence and organization, not for primary model reasoning.

## 3. Main Components

### Frontend

Important areas:

- `frontend/src/App.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/pieces.ts`
- `frontend/src/lib/captureLoop.ts`
- `frontend/src/lib/localDb.ts`
- `frontend/src/lib/cloudSync.ts`

The frontend has a summary tab and a chat tab. The summary explains the platform at a glance. The chat is where the developer asks follow-up questions using the latest local context.

### Backend

Important areas:

- `backend/src/index.ts`
- `backend/src/lib/pieces-rag.ts`
- `backend/src/lib/pieces.ts`

The backend performs the actual retrieval-and-answer loop:

1. fetch Pieces workstream data
2. parse and chunk it
3. build embeddings
4. retrieve top semantic matches
5. sanitize context
6. ask Cerebras
7. extract only the cited references for the UI

### Edge API

Important areas:

- `edge-api/src/index.ts`
- `edge-api/schema.ts`
- `edge-api/schema.sql`

This layer powers enterprise history, telemetry sync, team membership, and identity workflows.

## 4. End-to-End Data Flow

### Flow 1: Local Context Capture

1. The desktop app connects to Pieces OS.
2. It reads recent workstream summaries and annotations.
3. It stores the resulting snippets in local SQLite.
4. It avoids duplicate inserts when the workstream identity sequence has not changed.

Purpose:

- keep the latest context close to the user
- avoid unnecessary local database growth

### Flow 2: AI Question Answering

1. The user asks a question in chat.
2. The frontend loads the most recent local telemetry record.
3. The frontend posts `user_query`, `local_context`, and `branch` to the backend.
4. The backend runs RAG retrieval over indexed Pieces data.
5. Retrieved chunks are scrubbed for sensitive values.
6. The backend prompts the Cerebras model with grounded context and citation instructions.
7. The backend returns answer text and references.
8. The frontend renders the answer, inline citation chips, and technology cards.

Purpose:

- answer questions from real recent context
- keep the response understandable and auditable

### Flow 3: Enterprise Sync

1. The desktop app reads the latest local telemetry row.
2. It sends a sync payload to the Cloudflare Worker.
3. The Worker validates the payload and writes it to D1.
4. Enterprise features can later use this history for brief generation and team-level visibility.

Purpose:

- create organization-wide visibility without moving the full local desktop workflow into the cloud

## 5. The Three Documentation Layers in Product Terms

This project is intentionally documented the same way the product behaves:

### Outer Layer: Summary

Audience:

- executives
- product managers
- onboarding developers
- any non-domain specialist

What they need to know:

- what Sentinel does
- why it exists
- what each system layer is responsible for
- where trust and privacy are enforced

### Middle Layer: Architecture

Audience:

- application developers
- platform engineers
- technical leads

What they need to know:

- how data moves
- which service owns which decision
- where capture, retrieval, prompting, and persistence happen

### Deep Layer: Engineering Detail

Audience:

- engineers modifying the AI pipeline
- people debugging model behavior
- people extending citations, retrieval, or validation

What they need to know:

- exactly how chunks are created
- exactly how references are derived
- exactly how sensitive content is scrubbed
- exactly how the UI represents grounded answers

## 6. Trust, Validation, and Safety

The system does not rely on model output alone. It applies multiple controls:

- local-first capture keeps sensitive workflow data near the source
- regex-based scrubbing removes common secrets and identifiers
- the model is instructed not to reveal private values
- answer references are derived from retrieved chunks
- the UI exposes references as cards so the user can inspect supporting context

Important implementation note:

- the current codebase uses sanitization and grounded citations as the main validation strategy
- there is not yet a separate post-generation fact-checking service
- in this system, validation means controlled input, controlled prompting, and inspectable references

## 7. Current Architectural Notes

There are two Pieces ingestion paths in the current implementation:

- the frontend uses the Pieces SDK directly to fetch workstream summaries and annotations
- the backend uses an HTTP endpoint to fetch recent Pieces events for indexing

This is acceptable for a prototype or hackathon-stage system, but in a mature enterprise version the team may want to unify these ingestion paths behind a single context contract.

## 8. Recommended Reading Order

1. `../README.md`
2. `ARCHITECTURE.md`
3. `API_CONTRACTS.md`
4. `SYSTEM_DEEP_DIVE.md`
