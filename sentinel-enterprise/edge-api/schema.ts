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
  developerId: text("developer_id").notNull(),
  branch: text("branch").notNull(),
  codeSnippets: text("code_snippets"),
  timestamp: text("timestamp").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Telemetry = typeof telemetry.$inferSelect;
export type NewTelemetry = typeof telemetry.$inferInsert;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // We'll use random UUIDs for user IDs
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["lead", "member"] }).notNull(),
  teamId: text("team_id"), // Can be null if they are not assigned to a team
  jobTitle: text("job_title"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  senderEmail: text("sender_email").notNull(),
  receiverEmail: text("receiver_email").notNull(),
  status: text("status", { enum: ["pending", "accepted"] }).notNull().default("pending"),
  jobTitle: text("job_title"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
