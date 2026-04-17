import Database from "@tauri-apps/plugin-sql";
import { desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const LOCAL_DB_URL = "sqlite:sentinel-local.db";

const localLogs = sqliteTable("local_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  message: text("message").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const localContextCaptures = sqliteTable("local_context_captures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userQuery: text("user_query").notNull(),
  errorLog: text("error_log"),
  teammateRecentCode: text("teammate_recent_code"),
  branch: text("branch").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const localTelemetry = sqliteTable("local_telemetry", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branch: text("branch").notNull(),
  codeSnippets: text("code_snippets"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

type TauriRow = Record<string, unknown>;

let dbPromise: Promise<Database> | null = null;

export async function getTauriDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(LOCAL_DB_URL);
  }

  return dbPromise;
}

const proxy = async (
  generatedSql: string,
  params: unknown[],
  method: "run" | "all" | "values" | "get",
): Promise<{ rows: unknown[] }> => {
  const db = await getTauriDb();

  if (method === "run") {
    await db.execute(generatedSql, params);
    return { rows: [] };
  }

  const result = await db.select<TauriRow[]>(generatedSql, params);
  // Transform array of objects into array of arrays for Drizzle
  const rows = result.map((row: TauriRow) => Object.values(row));

  if (method === "get") {
    return { rows: rows.length > 0 ? [rows[0]] : [] };
  }

  return { rows };
};

export const localDrizzleDb = drizzle(proxy, {
  schema: {
    localLogs,
    localContextCaptures,
    localTelemetry,
  },
});

export async function createTables(): Promise<void> {
  const db = await getTauriDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS local_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS local_context_captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_query TEXT NOT NULL,
      error_log TEXT,
      teammate_recent_code TEXT,
      branch TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS local_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch TEXT NOT NULL,
      code_snippets TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function testInsertDummyLog(): Promise<void> {
  await createTables();

  await localDrizzleDb.insert(localLogs).values({
    message: "dummy drizzle log",
  });
}

export async function getLatestDummyLog(): Promise<{ id: number; message: string } | null> {
  await createTables();

  const rows = await localDrizzleDb
    .select({
      id: localLogs.id,
      message: localLogs.message,
    })
    .from(localLogs)
    .orderBy(desc(localLogs.id))
    .limit(1);

  return rows[0] ?? null;
}

export async function getLatestLocalContextCapture(): Promise<{
  id: number;
  userQuery: string;
  errorLog: string | null;
  teammateRecentCode: string | null;
  branch: string;
} | null> {
  await createTables();

  const rows = await localDrizzleDb
    .select({
      id: localContextCaptures.id,
      userQuery: localContextCaptures.userQuery,
      errorLog: localContextCaptures.errorLog,
      teammateRecentCode: localContextCaptures.teammateRecentCode,
      branch: localContextCaptures.branch,
    })
    .from(localContextCaptures)
    .orderBy(desc(localContextCaptures.id))
    .limit(1);

  return rows[0] ?? null;
}

export async function getLatestTelemetry(): Promise<{
  id: number;
  branch: string;
  codeSnippets: string | null;
  createdAt: string;
} | null> {
  await createTables();

  const rows = await localDrizzleDb
    .select({
      id: localTelemetry.id,
      branch: localTelemetry.branch,
      codeSnippets: localTelemetry.codeSnippets,
      createdAt: localTelemetry.createdAt,
    })
    .from(localTelemetry)
    .orderBy(desc(localTelemetry.id))
    .limit(1);

  return rows[0] ?? null;
}
