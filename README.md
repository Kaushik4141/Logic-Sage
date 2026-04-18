# Logic-Sage

Logic-Sage contains the `sentinel-enterprise` application, an enterprise desktop and cloud platform for turning live developer activity into safe, explainable AI assistance.

## Documentation Layers

This repository is documented in three layers so different readers can stop at the right depth:

1. `README.md`  
   High-level summary for any stakeholder. Read this first.
2. `sentinel-enterprise/ARCHITECTURE.md`  
   System architecture, component boundaries, data movement, and operating flow.
3. `sentinel-enterprise/SYSTEM_DEEP_DIVE.md`  
   Deep implementation guide for RAG, Cerebras generation, validation, citations, context cards, and chat behavior.

API and payload details live in `sentinel-enterprise/API_CONTRACTS.md`.

## What Sentinel Enterprise Does

Sentinel Enterprise captures recent developer context from Pieces OS, stores local telemetry in a Tauri desktop app, retrieves relevant context with a RAG pipeline, sends the grounded prompt to a Cerebras-hosted model, and returns an answer with validation-friendly references.

At a business level, the product solves one main problem:

- teams lose time because the context needed to answer a question is spread across local work, recent activity, and teammate state

Sentinel closes that gap by giving developers:

- a summary view for fast understanding
- deeper architectural documentation for implementation understanding
- a context-aware chat for follow-up questions
- citation-backed references so answers are easier to trust

## System Summary

The platform is organized into three runtime layers:

- `frontend/`: Tauri + React desktop client, local SQLite, chat UI, summary UI, and sync triggers
- `backend/`: Node.js orchestrator that performs RAG retrieval, sanitization, and Cerebras prompting
- `edge-api/`: Cloudflare Worker + D1 for enterprise identity, history, invitations, and telemetry sync

## Core Enterprise Flow

1. Pieces OS collects live workstream context from the developer machine.
2. The desktop app stores recent telemetry in local SQLite for fast local access.
3. The backend indexes Pieces context into an in-memory vector store.
4. A user question triggers semantic retrieval over the indexed context.
5. The retrieved context is scrubbed and sent to the Cerebras model.
6. The answer returns with inline citations and reference cards.
7. The outer summary gives the short explanation; the chat allows deeper exploration.

## Who Should Read What

- Product, delivery, leadership: stay in this `README.md`
- New developers: continue into `sentinel-enterprise/ARCHITECTURE.md`
- Engineers modifying AI, retrieval, or trust controls: continue into `sentinel-enterprise/SYSTEM_DEEP_DIVE.md`
- Engineers integrating clients or services: read `sentinel-enterprise/API_CONTRACTS.md`
