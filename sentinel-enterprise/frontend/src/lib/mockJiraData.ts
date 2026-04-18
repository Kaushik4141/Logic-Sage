export interface GitBlueprint {
  id: string;
  branch: string;
  commitHash: string;
  author: string;
  summary: string;
  key_context: string[];
  timestamp: string;
}

export interface JiraTicket {
  id: string;
  title: string;
  description: string;
  blueprintId: string;
  status: string;
}

export const mockGitBlueprints: GitBlueprint[] = [
  {
    id: "bp-001",
    branch: "feat/auth-revamp",
    commitHash: "7a2d9b4",
    author: "Alex Rivera",
    summary: "Refactored the JWT validation middleware to use a rotating secret key strategy and implemented Zero-Trust identity verification for all Layer 3 nodes.",
    key_context: [
      "JWT Rotation Logic",
      "Zero-Trust Implementation",
      "Middleware Optimization"
    ],
    timestamp: "2026-04-18T10:30:00Z"
  },
  {
    id: "bp-002",
    branch: "fix/latency-spike",
    commitHash: "c4f1e8a",
    author: "Sam Chen",
    summary: "Identified a memory leak in the WebSocket message buffer. Implemented a LRU cache for telemetry packets and optimized the broadcast loop to reduce P99 latency by 40ms.",
    key_context: [
      "Memory Management",
      "WebSocket Buffering",
      "Latency Optimization"
    ],
    timestamp: "2026-04-18T12:45:00Z"
  },
  {
    id: "bp-003",
    branch: "feat/predictive-injection",
    commitHash: "e9b2c1d",
    author: "Jordan Smith",
    summary: "Integrated Cerebras AI for real-time telemetry summarization. Added a new endpoint to generate developer blueprints from raw execution traces.",
    key_context: [
      "Cerebras AI Integration",
      "Blueprint Generation",
      "Telemetry Analysis"
    ],
    timestamp: "2026-04-18T15:20:00Z"
  }
];

export const mockJiraTicket: JiraTicket = {
  id: "SENT-402",
  title: "Optimize Telemetry Pipeline for Edge Nodes",
  description: "We are seeing intermittent timeouts when high-frequency telemetry is pushed from Layer 2 edge nodes. Investigation needed into the ingestion buffer and summarization logic.",
  blueprintId: "bp-002",
  status: "In Progress"
};
