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

export const taskTracker = sqliteTable("task_tracker", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: text("ticket_id").notNull().unique(),
  assigneeEmail: text("assignee_email").notNull(),
  title: text("title"),
  status: text("status", { enum: ["not_started", "working", "done"] }).notNull().default("not_started"),
  branchPattern: text("branch_pattern"),
  source: text("source", { enum: ["jira", "manual"] }).notNull().default("jira"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type TaskTracker = typeof taskTracker.$inferSelect;
export type NewTaskTracker = typeof taskTracker.$inferInsert;

export const projectManifest = sqliteTable("project_manifest", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  section: text("section").notNull().default("01_overview"),
  content: text("content").notNull(),
  generatedAt: text("generated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type ProjectManifest = typeof projectManifest.$inferSelect;
export type NewProjectManifest = typeof projectManifest.$inferInsert;
