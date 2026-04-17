import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

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
