import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const blueprints = sqliteTable("blueprints", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  author: text("author").notNull(),
  context: text("context").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Blueprint = typeof blueprints.$inferSelect;
export type NewBlueprint = typeof blueprints.$inferInsert;

export const telemetry = sqliteTable("telemetry", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branch: text("branch").notNull(),
  codeSnippets: text("code_snippets"),
  timestamp: text("timestamp").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Telemetry = typeof telemetry.$inferSelect;
export type NewTelemetry = typeof telemetry.$inferInsert;

