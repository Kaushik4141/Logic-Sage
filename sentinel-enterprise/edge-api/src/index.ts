/// <reference lib="webworker" />

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { blueprints, telemetry, users, invitations } from "../schema";

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
  developer_id: string;
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
  if (
    typeof payload.developer_id !== "string" ||
    typeof payload.branch !== "string" ||
    typeof payload.timestamp !== "string"
  ) {
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
    developer_id: payload.developer_id,
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
  
  if (body) {
    console.log('[Worker] Received payload:', {
      developer_id: body.developer_id,
      branch: body.branch,
      timestamp: body.timestamp,
      snippetsCount: Array.isArray(body.codeSnippets) ? body.codeSnippets.length : 1
    });
  }

  if (!body) {
    return json(
      {
        status: "error",
        message: "'developer_id', 'branch' and 'timestamp' are required string fields.",
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
      developerId: body.developer_id.trim(),
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

async function handlePostLogin(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const rawBody = await parseBody(request);
  if (!rawBody || typeof rawBody.email !== "string" || typeof rawBody.password !== "string" || typeof rawBody.role !== "string") {
    return json({ status: "error", message: "Invalid body: require email, password, role." }, 400, cors);
  }

  const db = drizzle(env.DB);
  const email = rawBody.email.trim();
  const password = rawBody.password;
  const role = rawBody.role === "lead" ? "lead" : "member";

  try {
    const existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let user = existingUsers[0];

    if (!user) {
      // Auto-register for the hackathon demo
      const id = crypto.randomUUID();
      [user] = await db.insert(users).values({
        id,
        email,
        password,
        role,
        teamId: role === "lead" ? email : null
      }).returning();
    } else if (user.password !== password) {
      return json({ status: "error", message: "Invalid credentials." }, 401, cors);
    }

    return json({ status: "success", data: user }, 200, cors);
  } catch (error) {
    return json({ status: "error", message: String(error) }, 500, cors);
  }
}

async function handlePostInvite(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const rawBody = await parseBody(request);
  if (!rawBody || typeof rawBody.senderEmail !== "string" || typeof rawBody.receiverEmail !== "string") {
    return json({ status: "error", message: "Invalid body" }, 400, cors);
  }

  const db = drizzle(env.DB);
  try {
    const id = crypto.randomUUID();
    const result = await db.insert(invitations).values({
      id,
      senderEmail: rawBody.senderEmail,
      receiverEmail: rawBody.receiverEmail,
      status: "pending",
      jobTitle: typeof rawBody.jobTitle === "string" ? rawBody.jobTitle : null
    }).returning();
    return json({ status: "success", data: result[0] }, 200, cors);
  } catch (error) {
    return json({ status: "error", message: String(error) }, 500, cors);
  }
}

async function handleAcceptInvite(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const rawBody = await parseBody(request);
  if (!rawBody || typeof rawBody.inviteId !== "string" || typeof rawBody.userEmail !== "string") {
    return json({ status: "error", message: "Invalid body" }, 400, cors);
  }

  const db = drizzle(env.DB);
  try {
    // 1. Mark invite accepted
    await db.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, rawBody.inviteId));
    
    // 2. Assign member to the sender's team and propagate the jobTitle
    const [invite] = await db.select().from(invitations).where(eq(invitations.id, rawBody.inviteId));
    if (invite) {
      // Look up the sender's teamId so the member joins the same team
      const [sender] = await db.select().from(users).where(eq(users.email, invite.senderEmail));
      const senderTeamId = sender?.teamId ?? invite.senderEmail;
      await db.update(users).set({ 
        teamId: senderTeamId,
        jobTitle: invite.jobTitle ?? undefined
      }).where(eq(users.email, rawBody.userEmail));
    }
    return json({ status: "success", message: "Invite accepted" }, 200, cors);
  } catch (error) {
    return json({ status: "error", message: String(error) }, 500, cors);
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

      // --- /api/events ---
      if (url.pathname === "/api/events" && request.method === "GET") {
        const stmt = env.DB.prepare(
          "SELECT * FROM enterprise_events ORDER BY id DESC LIMIT 20"
        );
        const { results } = await stmt.all();
        return json({ status: "success", data: results }, 200, cors);
      }

      // NEW ROUTE: Fetch the whole team's history for the Architecture Map
      if (url.pathname === "/api/team-history" && request.method === "GET") {
        const stmt = env.DB.prepare(
          "SELECT * FROM enterprise_events ORDER BY id DESC LIMIT 20"
        );
        const { results } = await stmt.all();
        return json({ status: "success", data: results }, 200, cors);
      }

      // --- /api/history/:username ---
      const historyMatch = url.pathname.match(/^\/api\/history\/([^/]+)$/);
      if (historyMatch && request.method === "GET") {
        const username = decodeURIComponent(historyMatch[1]);
        const stmt = env.DB.prepare(
          "SELECT * FROM telemetry WHERE developer_id = ? ORDER BY id DESC LIMIT 5"
        ).bind(username);
        const { results } = await stmt.all();
        return json({ status: "success", data: results }, 200, cors);
      }

      // --- Identity Routes ---
      if (url.pathname === "/api/login" && request.method === "POST") {
        return await handlePostLogin(request, env, cors);
      }
      if (url.pathname === "/api/invites" && request.method === "POST") {
        return await handlePostInvite(request, env, cors);
      }
      if (url.pathname === "/api/invites/accept" && request.method === "POST") {
        return await handleAcceptInvite(request, env, cors);
      }
      const invitesMatch = url.pathname.match(/^\/api\/invites\/([^/]+)$/);
      if (invitesMatch && request.method === "GET") {
        const email = decodeURIComponent(invitesMatch[1]);
        const db = drizzle(env.DB);
        const pending = await db.select().from(invitations)
           .where(eq(invitations.receiverEmail, email))
           .orderBy(desc(invitations.createdAt));
        return json({ status: "success", data: pending.filter((p: any) => p.status === 'pending') }, 200, cors);
      }
      
      const teamMatch = url.pathname.match(/^\/api\/team\/([^/]+)$/);
      if (teamMatch && request.method === "GET") {
        const teamId = decodeURIComponent(teamMatch[1]);
        const db = drizzle(env.DB);
        const members = await db.select().from(users).where(eq(users.teamId, teamId));
        return json({ status: "success", data: members }, 200, cors);
      }

      const roleMatch = url.pathname.match(/^\/api\/team\/([^/]+)\/role$/);
      if (roleMatch && request.method === "PATCH") {
        const userId = decodeURIComponent(roleMatch[1]);
        const rawBody = await parseBody(request);
        if (!rawBody || typeof rawBody.jobTitle !== "string") {
          return json({ status: "error", message: "jobTitle is required" }, 400, cors);
        }
        const db = drizzle(env.DB);
        try {
          await db.update(users).set({ jobTitle: rawBody.jobTitle }).where(eq(users.id, userId));
          return json({ status: "success", message: "Role updated" }, 200, cors);
        } catch(err) {
          return json({ status: "error", message: String(err) }, 500, cors);
        }
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
