/// <reference lib="webworker" />

import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { blueprints } from "../schema";

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

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
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

async function handleGetBlueprints(env: Env): Promise<Response> {
  const db = drizzle(env.DB);
  const rows = await db
    .select()
    .from(blueprints)
    .orderBy(desc(blueprints.createdAt))
    .limit(100);

  return json({ status: "success", data: rows });
}

async function handlePostBlueprint(request: Request, env: Env): Promise<Response> {
  const rawBody = await parseBody(request);
  if (!rawBody) {
    return json({ status: "error", message: "Invalid JSON body." }, 400);
  }

  const body = toBlueprintRequestBody(rawBody);
  if (!body) {
    return json(
      {
        status: "error",
        message: "'ticket_id', 'author', and 'context' are required string fields.",
      },
      400,
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

  return json({ status: "success", id }, 200);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/blueprints") {
        if (request.method === "GET") {
          return await handleGetBlueprints(env);
        }

        if (request.method === "POST") {
          return await handlePostBlueprint(request, env);
        }
      }

      const historyMatch = url.pathname.match(/^\/api\/history\/([^/]+)$/);
      if (historyMatch && request.method === "GET") {
        const username = decodeURIComponent(historyMatch[1]);
        const stmt = env.DB.prepare(
          "SELECT * FROM enterprise_events WHERE developer = ? ORDER BY id DESC LIMIT 5"
        ).bind(username);
        const { results } = await stmt.all();
        return json({ status: "success", data: results });
      }

      return json({ status: "error", message: "Not Found" }, 404);
    } catch (error) {
      return json(
        {
          status: "error",
          message: error instanceof Error ? error.message : "Unexpected worker error.",
        },
        500,
      );
    }
  },
};
