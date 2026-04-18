# Sentinel Enterprise API Contracts

This document describes the public and internal contracts used by the desktop app, backend orchestrator, and enterprise edge platform.

## 1. Desktop to Backend

### `POST /api/collaborate`

Purpose:

- ask a context-aware question
- run RAG retrieval
- generate a Cerebras answer with references

Request:

```json
{
  "user_query": "Why is authentication failing right now?",
  "local_context": {
    "error_log": "No error log available (background telemetry capture).",
    "teammate_recent_code": "Serialized recent Pieces snippets..."
  },
  "branch": "feature/hackathon"
}
```

Accepted fallback fields in current backend implementation:

- `query`
- `userMessage`

Success response:

```json
{
  "status": "success",
  "text": "Authentication is likely failing because the token flow and session state handling changed in the latest workstream context [1][2].",
  "references": [
    {
      "id": 1,
      "title": "JWT",
      "timestamp": "2026-04-18T10:00:00.000Z",
      "snippet": "Recent context mentions bearer token handling and session validation...",
      "score": "0.842",
      "source": "pieces",
      "technology": "JWT",
      "details": "JWT is the token format being used for signed session claims.",
      "imageUrl": "https://cdn.simpleicons.org/jsonwebtokens",
      "imageAlt": "JWT"
    }
  ]
}
```

Error response:

```json
{
  "status": "error",
  "message": "Missing user_query"
}
```

### `GET /api/rag/status`

Purpose:

- report whether the backend retrieval index is ready

Response:

```json
{
  "ready": true,
  "chunks": 84
}
```

### `POST /api/rag/update`

Purpose:

- push additional context into the in-memory RAG index without full rebuild

Request:

```json
{
  "data": "Raw Pieces workstream text or serialized event payload"
}
```

Response:

```json
{
  "ok": true,
  "status": {
    "ready": true,
    "chunks": 96
  }
}
```

### `POST /api/developer-brief/:username`

Purpose:

- create a one-sentence developer brief using cloud history plus local context

Request:

```json
{
  "local_context": {
    "error_log": "Optional workflow summary",
    "teammate_recent_code": "Optional local code summary"
  }
}
```

Success response:

```json
{
  "status": "success",
  "brief": "The developer is working on authentication flow cleanup and telemetry-backed session diagnostics."
}
```

## 2. Desktop to Edge API

### `POST /api/sync`

Purpose:

- sync the latest local telemetry row to Cloudflare D1

Request:

```json
{
  "developer_id": "user-123",
  "branch": "feature/hackathon",
  "codeSnippets": [
    "snippet 1",
    "snippet 2"
  ],
  "timestamp": "2026-04-18T12:30:45.000Z"
}
```

Success response:

```json
{
  "status": "success",
  "message": "Telemetry synced to D1."
}
```

## 3. Edge Identity and Team APIs

### `POST /api/login`

Purpose:

- authenticate or auto-register a demo user

Request:

```json
{
  "email": "lead@example.com",
  "password": "secret",
  "role": "lead"
}
```

### `POST /api/invites`

Purpose:

- create a team invitation

Request:

```json
{
  "senderEmail": "lead@example.com",
  "receiverEmail": "member@example.com",
  "jobTitle": "Frontend Engineer"
}
```

### `POST /api/invites/accept`

Purpose:

- accept an invitation and join the sender team

Request:

```json
{
  "inviteId": "invite-123",
  "userEmail": "member@example.com"
}
```

### `GET /api/invites/:email`

Purpose:

- load pending invitations for a user

### `GET /api/team/:teamId`

Purpose:

- load team members for a team

### `PATCH /api/team/:userId/role`

Purpose:

- update a team member job title

Request:

```json
{
  "jobTitle": "Platform Engineer"
}
```

## 4. Edge History and Blueprint APIs

### `GET /api/history/:username`

Purpose:

- return recent telemetry history for a developer

Success response:

```json
{
  "status": "success",
  "data": [
    {
      "developer_id": "user-123",
      "branch": "feature/hackathon",
      "code_snippets": "[\"snippet\"]",
      "timestamp": "2026-04-18T12:30:45.000Z"
    }
  ]
}
```

### `GET /blueprints`

Purpose:

- list the latest blueprint records

### `POST /blueprints`

Purpose:

- create a blueprint record

Request:

```json
{
  "ticket_id": "ENG-402",
  "author": "dev-a",
  "context": "Authentication context for ticket handoff"
}
```

## 5. Reference Contract

The `references` array returned by the backend is central to trust and explainability.

Each reference may include:

- `id`: citation number used in the answer text
- `title`: cleaned human-readable reference name
- `timestamp`: source time when available
- `snippet`: short excerpt from retrieved context
- `score`: similarity score as a string
- `source`: current source bucket, presently `pieces`
- `technology`: enriched technology label for UI display
- `details`: one-sentence explanation of the technology or concept
- `imageUrl`: optional technology icon URL
- `imageAlt`: accessibility label

## 6. Contract Notes

- `/api/collaborate` is the most important runtime contract in the product
- the frontend currently posts telemetry-derived local context even though the backend answer is primarily grounded in the backend RAG index
- the system uses references as the validation surface shown to users
- the edge platform stores history and identity data, but the main answer generation remains in the backend
