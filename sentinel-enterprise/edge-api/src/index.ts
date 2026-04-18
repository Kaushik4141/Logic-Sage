/// <reference lib="webworker" />

import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { blueprints, telemetry } from "../schema";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
};

interface Env {
  DB: D1Database;
}

type BlueprintRequestBody = {
  id?: string;
  ticket_id: string;
  author: string;
  context: string;
};

type SyncRequestBody = {
  branch: string;
  codeSnippets: string[] | string;
  timestamp: string;
};

const ALLOWED_ORIGINS = [
  "http://localhost:1420",
  "tauri://localhost",
  "https://tauri.localhost",
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data: unknown, status = 200, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const payload = await request.json();
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function toBlueprintRequestBody(payload: Record<string, unknown>): BlueprintRequestBody | null {
  if (
    typeof payload.ticket_id !== "string" ||
    typeof payload.author !== "string" ||
    typeof payload.context !== "string"
  ) {
    return null;
  }

  return {
    id: typeof payload.id === "string" ? payload.id : undefined,
    ticket_id: payload.ticket_id,
    author: payload.author,
    context: payload.context,
  };
}

function toSyncRequestBody(payload: Record<string, unknown>): SyncRequestBody | null {
  if (typeof payload.branch !== "string" || typeof payload.timestamp !== "string") {
    return null;
  }

  // Accept codeSnippets as an array of strings OR a pre-serialized JSON string
  let codeSnippets: string[] | string;
  if (Array.isArray(payload.codeSnippets)) {
    codeSnippets = payload.codeSnippets.filter(
      (item): item is string => typeof item === "string",
    );
  } else if (typeof payload.codeSnippets === "string") {
    codeSnippets = payload.codeSnippets;
  } else {
    codeSnippets = [];
  }

  return {
    branch: payload.branch,
    codeSnippets,
    timestamp: payload.timestamp,
  };
}

async function handleGetBlueprints(env: Env, cors: Record<string, string>): Promise<Response> {
  const db = drizzle(env.DB);
  const rows = await db
    .select()
    .from(blueprints)
    .orderBy(desc(blueprints.createdAt))
    .limit(100);

  return json({ status: "success", data: rows }, 200, cors);
}

async function handlePostBlueprint(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const rawBody = await parseBody(request);
  if (!rawBody) {
    return json({ status: "error", message: "Invalid JSON body." }, 400, cors);
  }

  const body = toBlueprintRequestBody(rawBody);
  if (!body) {
    return json(
      {
        status: "error",
        message: "'ticket_id', 'author', and 'context' are required string fields.",
      },
      400,
      cors,
    );
  }

  const db = drizzle(env.DB);
  const id = body.id ?? crypto.randomUUID();

  await db.insert(blueprints).values({
    id,
    ticketId: body.ticket_id.trim(),
    author: body.author.trim(),
    context: body.context.trim(),
  });

  return json({ status: "success", id }, 200, cors);
}

async function handlePostSync(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const rawBody = await parseBody(request);
  if (!rawBody) {
    return json({ status: "error", message: "Invalid JSON body." }, 400, cors);
  }

  const body = toSyncRequestBody(rawBody);
  console.log('[Worker] Received payload:', body);
  if (!body) {
    return json(
      {
        status: "error",
        message: "'branch' and 'timestamp' are required string fields.",
      },
      400,
      cors,
    );
  }

  // Serialize codeSnippets to a JSON string if it's an array
  const serializedSnippets =
    typeof body.codeSnippets === "string"
      ? body.codeSnippets
      : JSON.stringify(body.codeSnippets);

  const db = drizzle(env.DB);

  try {
    const result = await db.insert(telemetry).values({
      branch: body.branch.trim(),
      codeSnippets: serializedSnippets,
      timestamp: body.timestamp,
    }).returning();
    
    console.log('[Worker] Drizzle insert result:', result);

    return json({ status: "success", message: "Telemetry synced to D1." }, 200, cors);
  } catch (error) {
    console.error('[Worker] Drizzle insert failed:', error);
    return json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Database insert failed.",
      },
      500,
      cors,
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    try {
      // --- /api/sync ---
      if (url.pathname === "/api/sync" && request.method === "POST") {
        return await handlePostSync(request, env, cors);
      }

      // --- /blueprints ---
      if (url.pathname === "/blueprints") {
        if (request.method === "GET") {
          return await handleGetBlueprints(env, cors);
        }

        if (request.method === "POST") {
          return await handlePostBlueprint(request, env, cors);
        }
      }

      // --- /api/history/:username ---
      const historyMatch = url.pathname.match(/^\/api\/history\/([^/]+)$/);
      if (historyMatch && request.method === "GET") {
        const username = decodeURIComponent(historyMatch[1]);
        const stmt = env.DB.prepare(
          "SELECT * FROM enterprise_events WHERE developer = ? ORDER BY id DESC LIMIT 5"
        ).bind(username);
        const { results } = await stmt.all();
        return json({ status: "success", data: results }, 200, cors);
      }

      return json({ status: "error", message: "Not Found" }, 404, cors);
    } catch (error) {
      return json(
        {
          status: "error",
          message: error instanceof Error ? error.message : "Unexpected worker error.",
        },
        500,
        cors,
      );
    }
  },
};
