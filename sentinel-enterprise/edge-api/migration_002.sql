-- Migration 002: Add task_tracker and project_manifest tables
-- Run with: wrangler d1 execute logicsage --file=./migration_002.sql

CREATE TABLE IF NOT EXISTS task_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL UNIQUE,
  assignee_email TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started', 'working', 'done')),
  branch_pattern TEXT,
  source TEXT NOT NULL DEFAULT 'jira',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_tracker_assignee ON task_tracker(assignee_email);
CREATE INDEX IF NOT EXISTS idx_task_tracker_status ON task_tracker(status);
CREATE INDEX IF NOT EXISTS idx_task_tracker_ticket ON task_tracker(ticket_id);

CREATE TABLE IF NOT EXISTS project_manifest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section TEXT NOT NULL DEFAULT '01_overview',
  content TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_manifest_section ON project_manifest(section);
