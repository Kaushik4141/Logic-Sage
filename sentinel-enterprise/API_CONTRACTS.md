# API CONTRACTS & MOCK DATA

## 1. Tauri -> Node.js (AI Query Payload)
**Endpoint:** `POST /api/collaborate`  
**Description:** Tauri sends the local Pieces context and the user's question to the backend orchestrator.

```json
{
  "user_query": "Why is the auth API crashing on my machine?",
  "local_context": {
    "error_log": "Cannot read properties of undefined (reading 'firstName')",
    "teammate_recent_code": "interface User { firstName: string, lastName: string }"
  },
  "branch": "feature/auth-update"
}
```

## 2. Node.js -> Tauri (AI Response Stream)
**Format:** Server-Sent Events (SSE) or Vercel AI Stream  
**Description:** The scrubbed, deterministic AI answer explaining the context gap.

```json
{
  "status": "success",
  "text": "Your app is crashing because Member 2 silently updated the User payload locally to use `firstName` instead of `name`. Update your interface to match."
}
```

## 3. Webhook Trigger (Postman -> Node.js)
**Endpoint:** `POST /api/webhooks/jira`  
**Description:** Fakes a Jira assignment to trigger Predictive Knowledge Injection.

```json
{
  "event": "ticket_assigned",
  "ticket_id": "ENG-402",
  "assignee": "Dev B",
  "related_blueprint_id": "bp_8847"
}
```
