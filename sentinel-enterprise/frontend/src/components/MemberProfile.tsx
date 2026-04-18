import {
  Activity,
  AlertCircle,
  BadgeInfo,
  Check,
  ChevronRight,
  Clock,
  Code2,
  Edit2,
  FileText,
  GitBranch,
  Layers3,
  Loader2,
  MessageSquare,
  Search,
  Send,
  Signal,
  Sparkles,
  Terminal,
  Users,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { askSentinelAI, askSentinelWithContext, getDepthExplanation, getDeveloperBrief, type RagReference } from "@/lib/api";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TelemetryEntry {
  id: number;
  developer_id: string;
  branch: string;
  code_snippets: string | null;
  timestamp: string;
  created_at: string;
}

interface MemberProfileProps {
  member: {
    id: string;
    email: string;
    jobTitle?: string | null;
    role: string;
    name?: string;
    avatar?: string;
    isLive?: boolean;
    department?: string;
    status?: string;
    file?: string;
    time?: string;
    branch?: string;
    uptime?: string;
    tasks?: string[];
  };
  isLead?: boolean;
  onRoleUpdate?: (userId: string, newRole: string) => Promise<void>;
}

interface MemberChatMessage {
  id: number;
  role: "user" | "ai";
  content: string;
  references?: RagReference[];
}

function parseSnippets(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
    return [String(parsed)];
  } catch {
    return raw ? [raw] : [];
  }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function timeSince(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "-";
  }
}

function normalizeSnippetText(snippets: string[]): string {
  return snippets.filter(Boolean).join("\n\n-----------------------------------------------\n\n");
}

function cleanSnippetLine(line: string): string {
  return line
    .replace(/[*_#>`]/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericWorkstreamTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized.length === 0 || normalized === "uncategorized activity";
}

function isMeaningfulSnippetLine(line: string): boolean {
  const normalized = cleanSnippetLine(line);
  if (!normalized) return false;
  if (/^-{5,}$/.test(normalized)) return false;
  if (/^summary id:/i.test(normalized)) return false;
  if (/^timestamp:/i.test(normalized)) return false;
  if (/^--\s*live workstream context:/i.test(normalized)) return false;
  if (/^live workstream context:/i.test(normalized)) return false;
  if (/^continuous telemetry tracked by pieces os pattern engine\.?$/i.test(normalized)) return false;
  if (/^tldr$/i.test(normalized)) return false;
  if (/^core tasks/i.test(normalized)) return false;
  if (/^key discussions/i.test(normalized)) return false;
  if (/^resources reviewed/i.test(normalized)) return false;
  if (/^next steps/i.test(normalized)) return false;
  if (/^persona report/i.test(normalized)) return false;
  if (/^who you are$/i.test(normalized)) return false;
  if (/^what you work on$/i.test(normalized)) return false;
  return true;
}

function getSnippetBodyLines(snippet: string): string[] {
  return snippet
    .split("\n")
    .map(cleanSnippetLine)
    .filter(isMeaningfulSnippetLine);
}

function buildFallbackBrief(memberName: string, branch: string, snippets: string[]): string {
  const metadata = extractSnippetMetadata(snippets);
  const lines = snippets.flatMap(getSnippetBodyLines);
  const focus =
    lines.find((line) => line.length > 60) ??
    lines[0] ??
    "no recent Pieces context is available for this developer";
  const workstream = metadata.titles[0];
  const sentenceOne = workstream
    ? `${memberName} is currently focused on ${workstream.toLowerCase()} on ${branch || "an active branch"}.`
    : `${memberName} is currently working on ${branch || "an active branch"}.`;
  const detail = focus.endsWith(".") ? focus : `${focus}.`;
  return `${sentenceOne} Latest synced context indicates ${detail}`;
}

// ─── Snippet Metadata Extraction (intelligent) ────────────────────
// Known technology terms for chip detection inside raw snippets
const KNOWN_TECHNOLOGIES = [
  "React", "TypeScript", "JavaScript", "Node.js", "Express", "Tailwind",
  "Vite", "Tauri", "Drizzle", "SQLite", "D1", "Cloudflare", "Cerebras",
  "LangChain", "Xenova", "Pieces", "RAG", "JWT", "OAuth", "REST",
  "GraphQL", "SSE", "WebSocket", "Docker", "Redis", "Postgres", "MongoDB",
  "API", "SDK", "CLI", "CORS", "gRPC", "Mermaid", "Radix", "Framer",
  "Motion", "Lucide", "Zustand", "Prisma", "Zod", "tRPC", "Next.js",
];

const BRANCH_INTENT_MAP: Record<string, string> = {
  feat: "Feature", fix: "Bug Fix", hotfix: "Hotfix", release: "Release",
  chore: "Chore", bugfix: "Bug Fix", refactor: "Refactor", test: "Testing",
  docs: "Documentation", ci: "CI/CD", perf: "Performance",
};

interface SnippetMetadata {
  titles: string[];
  notes: string[];
  technologies: string[];
  branchIntent: string | null;
  decisions: string[];
}

function extractSnippetMetadata(snippets: string[]): SnippetMetadata {
  const text = normalizeSnippetText(snippets);
  const titles = [...text.matchAll(/LIVE WORKSTREAM CONTEXT:\s*(.+?)(?:\s*---|\n)/g)]
    .map((match) => match[1].trim())
    .filter((title) => !isGenericWorkstreamTitle(title))
    .filter((title, index, all) => all.indexOf(title) === index)
    .slice(0, 4);

  const notes = snippets
    .flatMap(getSnippetBodyLines)
    .filter((line) => !isGenericWorkstreamTitle(line))
    .filter((line) => line.length >= 20)
    .filter((line, index, all) => all.indexOf(line) === index)
    .slice(0, 4);

  // Detect technologies mentioned in the raw text
  const lowerText = text.toLowerCase();
  const technologies = KNOWN_TECHNOLOGIES
    .filter((tech) => lowerText.includes(tech.toLowerCase()))
    .filter((t, i, a) => a.indexOf(t) === i);

  // Detect branch intent from prefixes (feat/, fix/, etc.)
  const branchPrefixMatch = text.match(/(?:feat|fix|hotfix|release|chore|bugfix|refactor|test|docs|ci|perf)\//i);
  const branchIntent = branchPrefixMatch
    ? BRANCH_INTENT_MAP[branchPrefixMatch[0].replace("/", "").toLowerCase()] ?? null
    : null;

  // Extract lines that look like decisions or trade-offs
  const decisionPatterns = /(?:decided|chose|switched|migrated|replaced|refactored|moved to|opted for|trade-off|instead of)/i;
  const decisions = snippets
    .flatMap(getSnippetBodyLines)
    .filter((line) => decisionPatterns.test(line))
    .filter((line) => line.length >= 25)
    .filter((l, i, a) => a.indexOf(l) === i)
    .slice(0, 3);

  return { titles, notes, technologies, branchIntent, decisions };
}

function extractSnippetPreview(snippet: string): string {
  const lines = getSnippetBodyLines(snippet);
  const previewSource =
    lines.find((line) => line.length > 50) ??
    lines[0] ??
    "No meaningful snippet details were available for this telemetry record.";
  return previewSource.replace(/\s+/g, " ").trim().slice(0, 220);
}

// ─── Highlight Detection ───────────────────────────────────────
// Regex that detects technical terms worth highlighting inside the AI brief.
// Matches: branch names (feat/*, fix/*, etc.), quoted strings, PascalCase/camelCase
// identifiers (≥2 segments), well-known tech terms, ALL_CAPS constants,
// and file paths (*.ts, *.tsx, *.json, etc.).
const HIGHLIGHT_REGEX =
  /(?:(?:feat|fix|hotfix|release|chore|bugfix)\/[\w.\-/]+)|(?:"[^"]{3,}")|(?:'[^']{3,}')|(?:[A-Z][a-z]+(?:[A-Z][a-z]+){1,})|(?:[a-z]+(?:[A-Z][a-z]+){1,})|(?:\b(?:React|TypeScript|JavaScript|Node\.js|Express|Tailwind|Vite|Tauri|Drizzle|SQLite|D1|Cloudflare|Cerebras|LangChain|Xenova|Pieces|RAG|JWT|OAuth|REST|GraphQL|SSE|WebSocket|Docker|Redis|Postgres|MongoDB|API|SDK|CLI|CORS|CRUD|CI\/CD|MFA|TLS|SSR|CSR|SPA|PWA|ORM|CDN|DNS|HTTP|HTTPS|gRPC)\b)|(?:\b[A-Z][A-Z0-9_]{2,}\b)|(?:[\w\-]+\.(?:ts|tsx|js|jsx|json|sql|toml|css|md|yaml|yml)\b)/g;

// Powered by real-time Pieces OS telemetry + Cloudflare D1 sync
export function MemberProfile({ member, isLead, onRoleUpdate }: MemberProfileProps) {
  const memberRecord = member ?? {
    id: "unknown",
    email: "unknown@sentinel.local",
    role: "member",
  };
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [newRole, setNewRole] = useState(memberRecord.jobTitle || memberRecord.role || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [activeLayer, setActiveLayer] = useState<"brief" | "snippet" | "chat">("brief");
  const [brief, setBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<MemberChatMessage[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  // "member" = scoped to this member's telemetry, "team" = full team RAG via askSentinelAI
  const [chatScope, setChatScope] = useState<"member" | "team">("member");
  // Clicked highlight phrase — drives the Depth Inspection drill-down
  const [clickedPhrase, setClickedPhrase] = useState<string | null>(null);
  const [depthExplanation, setDepthExplanation] = useState("");
  const [depthLoading, setDepthLoading] = useState(false);
  const [depthReferences, setDepthReferences] = useState<RagReference[]>([]);

  useEffect(() => {
    if (!memberRecord.id || memberRecord.id === "unknown") return;
    let mounted = true;

    const fetchTelemetry = async () => {
      setTelemetryLoading(true);
      try {
        const res = await fetch(
          `https://edge-api.kaushik0h0s.workers.dev/api/history/${encodeURIComponent(memberRecord.id)}`,
        );
        const json = await res.json();
        if (mounted && json.status === "success") {
          setTelemetry(json.data ?? []);
        }
      } catch (err) {
        console.error("[MemberProfile] Failed to fetch telemetry", err);
      } finally {
        if (mounted) setTelemetryLoading(false);
      }
    };

    void fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [memberRecord.id]);

  const handleUpdateRole = async () => {
    if (!onRoleUpdate) return;
    setIsUpdating(true);
    try {
      await onRoleUpdate(memberRecord.id, newRole);
      setIsEditingRole(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const displayName = memberRecord.name || memberRecord.email.split("@")[0];
  const displayAvatar =
    memberRecord.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${memberRecord.email}`;
  const displayRole = memberRecord.jobTitle || memberRecord.role;
  const latestEntry = telemetry[0];

  const latestSnippets = useMemo(
    () => parseSnippets(latestEntry?.code_snippets ?? null),
    [latestEntry],
  );
  const latestContext = useMemo(
    () => ({
      error_log: latestEntry
        ? `Latest telemetry recorded ${formatTimestamp(latestEntry.timestamp)} on branch ${latestEntry.branch}.`
        : "No recent telemetry available.",
      teammate_recent_code:
        normalizeSnippetText(latestSnippets) || "No recent code snippet available from Pieces OS.",
    }),
    [latestEntry, latestSnippets],
  );
  const snippetMetadata = useMemo(
    () => extractSnippetMetadata(latestSnippets),
    [latestSnippets],
  );

  useEffect(() => {
    setNewRole(memberRecord.jobTitle || memberRecord.role || "");
  }, [memberRecord.jobTitle, memberRecord.role]);

  useEffect(() => {
    setBrief("");
    setBriefError(null);
    setChatHistory([]);
    setChatMessage("");
    setChatScope("member");
    setClickedPhrase(null);
    setDepthExplanation("");
    setDepthReferences([]);
    setActiveLayer("brief");
  }, [memberRecord.id]);

  useEffect(() => {
    if (!latestEntry) return;

    let active = true;
    const loadBrief = async () => {
      setBriefLoading(true);
      setBriefError(null);
      try {
        const generated = await getDeveloperBrief(memberRecord.id, latestContext);
        if (active) {
          setBrief(generated || buildFallbackBrief(displayName, latestEntry.branch, latestSnippets));
        }
      } catch (error) {
        if (active) {
          setBrief(buildFallbackBrief(displayName, latestEntry.branch, latestSnippets));
          setBriefError(error instanceof Error ? error.message : "Unable to load AI brief.");
        }
      } finally {
        if (active) setBriefLoading(false);
      }
    };

    void loadBrief();
    return () => {
      active = false;
    };
  }, [memberRecord.id, latestEntry, latestContext, latestSnippets, displayName]);

  if (!member) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground font-mono space-y-4">
        <Terminal className="h-10 w-10 opacity-20" />
        <p className="text-xs uppercase tracking-widest">Awaiting Identity Context...</p>
      </div>
    );
  }

  /**
   * When a highlighted phrase in the Brief is clicked, switch to
   * Depth Inspection and fetch a dedicated RAG explanation for ONLY
   * that phrase scoped to this member's telemetry.
   */
  const handleHighlightClick = async (phrase: string) => {
    setClickedPhrase(phrase);
    setActiveLayer("snippet");
    setDepthExplanation("");
    setDepthReferences([]);
    setDepthLoading(true);

    try {
      const response = await getDepthExplanation(
        displayName,
        phrase,
        latestContext,
      );
      setDepthExplanation(response.text);
      setDepthReferences(response.references);
    } catch (err) {
      // Fallback: use the generic collaborate endpoint if the depth route isn't deployed yet
      try {
        const depthPrompt = `Explain in detail what "${phrase}" refers to in the context of this developer's recent work. Cover its purpose, how it's used, relevant files, and any decisions or trade-offs involved.`;
        const fallback = await askSentinelWithContext(
          depthPrompt,
          latestContext,
          latestEntry?.branch ?? "unknown",
        );
        setDepthExplanation(fallback.text);
        setDepthReferences(fallback.references);
      } catch (fallbackErr) {
        setDepthExplanation(
          `Could not retrieve depth explanation: ${
            fallbackErr instanceof Error ? fallbackErr.message : "Unknown error"
          }`,
        );
      }
    } finally {
      setDepthLoading(false);
    }
  };

  /**
   * Parses brief text and wraps matched technical terms in interactive
   * highlight chips. Returns an array of React nodes.
   */
  const highlightBriefText = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    // Reset the global regex state
    HIGHLIGHT_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
      // Push plain text before this match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const phrase = match[0];
      parts.push(
        <TooltipProvider key={`hl-${match.index}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={() => handleHighlightClick(phrase)}
                onKeyDown={(e) => e.key === "Enter" && handleHighlightClick(phrase)}
                className="inline-flex items-center gap-0.5 cursor-pointer rounded px-1 py-0.5 text-primary font-semibold bg-primary/8 border-b border-primary/30 hover:bg-primary/15 hover:scale-[1.03] active:scale-100 transition-all duration-150 select-none"
              >
                {phrase}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              Click for deeper explanation
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>,
      );
      lastIndex = match.index + phrase.length;
    }

    // Push remaining plain text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  const handleSendChat = async () => {
    if (!chatMessage.trim() || chatLoading || !latestEntry) return;

    const prompt = chatMessage.trim();
    const userMessage: MemberChatMessage = {
      id: Date.now(),
      role: "user",
      content: prompt,
    };

    setChatHistory((prev) => [...prev, userMessage]);
    setChatMessage("");
    setChatLoading(true);

    try {
      // "member" scope → member-specific telemetry context
      // "team" scope   → full team RAG via askSentinelAI
      const response =
        chatScope === "team"
          ? await askSentinelAI(prompt)
          : await askSentinelWithContext(prompt, latestContext, latestEntry.branch);

      setChatHistory((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "ai",
          content: response.text,
          references: response.references,
        },
      ]);
    } catch (error) {
      setChatHistory((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "ai",
          content: `Unable to complete this ${chatScope === "team" ? "team-context" : "member-context"} chat request: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background min-h-0 font-sans border-l border-border">
      <ScrollArea className="flex-1 min-h-0 relative">
        <div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="p-10 max-w-5xl mx-auto space-y-12 relative z-10">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="relative group">
              <Avatar className="h-32 w-32 border-4 border-background ring-2 ring-border shadow-2xl relative transition-transform group-hover:scale-105">
                <AvatarImage src={displayAvatar} />
                <AvatarFallback className="text-3xl text-muted-foreground">
                  {displayName[0]}
                </AvatarFallback>
              </Avatar>
              {memberRecord.isLive && (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -bottom-2 -right-2 bg-blue-500 text-[10px] font-bold text-white px-2.5 py-1 rounded-full border-2 border-background shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                >
                  LIVE
                </motion.div>
              )}
            </div>

            <div className="space-y-4 flex-1">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-bold tracking-tight text-foreground uppercase">
                    {displayName}
                  </h1>
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-widest bg-muted/30 border-border/50 font-mono py-0.5"
                  >
                    UID::{memberRecord.id.substring(0, 8)}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 py-1">
                  {isEditingRole ? (
                    <div className="flex items-center gap-2 bg-muted/20 border border-border p-1 rounded-lg">
                      <input
                        className="bg-transparent border-none px-2 py-1 text-sm font-sans focus:outline-none w-48 text-foreground"
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && void handleUpdateRole()}
                      />
                      <div className="flex items-center gap-1 border-l border-border pl-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-500 hover:bg-green-500/10"
                          onClick={() => void handleUpdateRole()}
                          disabled={isUpdating}
                        >
                          {isUpdating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => setIsEditingRole(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 group/role">
                      <p className="text-xl text-primary font-medium font-sans italic opacity-90">
                        {displayRole}
                      </p>
                      {isLead && (
                        <button
                          onClick={() => {
                            setNewRole(displayRole);
                            setIsEditingRole(true);
                          }}
                          className="opacity-0 group-hover/role:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground border border-transparent hover:border-border"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-6 pt-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                    <Terminal className="h-3 w-3" /> Department
                  </span>
                  <span className="text-xs font-semibold uppercase">
                    {memberRecord.department || "GENERAL_OPS"}
                  </span>
                </div>
                <Separator orientation="vertical" className="h-10 hidden md:block" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                    <Activity className="h-3 w-3" /> Last Sync
                  </span>
                  <span className="text-xs font-mono text-blue-400">
                    {latestEntry ? timeSince(latestEntry.timestamp) : "-"}
                  </span>
                </div>
                <Separator orientation="vertical" className="h-10 hidden md:block" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                    <BadgeInfo className="h-3 w-3" /> Telemetry Entries
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] font-bold uppercase border-green-500/30 text-green-500 bg-green-500/5"
                  >
                    {telemetry.length} record{telemetry.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-border/50" />

          <div className="space-y-8">
            <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2 border-b border-border pb-3">
              <Layers3 className="h-3.5 w-3.5" /> Member_Context_Layers
              {telemetryLoading && <Loader2 className="h-3 w-3 animate-spin ml-auto text-primary" />}
            </h3>

            {telemetry.length === 0 && !telemetryLoading && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
                <div className="p-4 rounded-2xl bg-muted/10 border border-border">
                  <Signal className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  No telemetry data for this operator yet.
                </p>
                <p className="text-[11px] text-muted-foreground/60 max-w-sm">
                  Telemetry will appear here once this member pushes code context to the Sentinel cloud.
                </p>
              </div>
            )}

            {latestEntry && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  {[
                    { key: "brief", label: "Brief", icon: Sparkles },
                    { key: "snippet", label: "Depth Inspection", icon: Search },
                    { key: "chat", label: "Contextual Chat", icon: MessageSquare },
                  ].map((layer) => {
                    const Icon = layer.icon;
                    const isActive = activeLayer === layer.key;
                    return (
                      <button
                        key={layer.key}
                        type="button"
                        onClick={() => setActiveLayer(layer.key as "brief" | "snippet" | "chat")}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                          isActive
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {layer.label}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                {activeLayer === "brief" && (
                  <motion.div
                    key="brief-tab"
                    exit={{ opacity: 0, y: -8 }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-muted/5 overflow-hidden"
                  >
                    <div className="flex items-center gap-3 px-5 py-3 bg-muted/10 border-b border-border/50">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary">
                        Layer 1 :: Brief
                      </span>
                      <div className="ml-auto flex items-center gap-4 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-mono">
                          <GitBranch className="h-3 w-3" />
                          {latestEntry.branch}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(latestEntry.timestamp)}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 space-y-6">
                      <div className="rounded-lg border border-border/60 bg-background/80 p-4">
                        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          <Sparkles className="h-3 w-3" />
                          Pieces Brief With AI
                          {briefLoading && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                        </div>
                        <div className="text-sm leading-relaxed text-foreground/85">
                          {briefLoading ? (
                            <div className="space-y-3">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-5/6" />
                              <Skeleton className="h-4 w-4/6" />
                            </div>
                          ) : (
                            <p>
                              {highlightBriefText(
                                brief || buildFallbackBrief(displayName, latestEntry.branch, latestSnippets),
                              )}
                            </p>
                          )}
                        </div>
                        {clickedPhrase && (
                          <div className="mt-3 text-[10px] text-muted-foreground italic flex items-center gap-1.5">
                            <Search className="h-3 w-3" />
                            Inspecting <span className="font-semibold text-primary">"{clickedPhrase}"</span> — see Depth Inspection tab
                          </div>
                        )}
                        {briefError && (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
                            <AlertCircle className="h-3.5 w-3.5" />
                            AI brief fallback used: {briefError}
                          </div>
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-border/60 bg-background/80 p-4">
                          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Side Notes
                          </div>
                          <div className="space-y-3">
                            <div>
                              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                Active Workstreams
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(snippetMetadata.titles.length > 0
                                  ? snippetMetadata.titles
                                  : ["Latest Pieces Context"]).map((title) => (
                                  <Badge key={title} variant="outline" className="border-border/60 bg-muted/20 text-[10px]">
                                    {title}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                Notes
                              </div>
                              <div className="space-y-2">
                                {(snippetMetadata.notes.length > 0
                                  ? snippetMetadata.notes
                                  : [
                                      `Latest telemetry was synced ${timeSince(latestEntry.timestamp)} on branch ${latestEntry.branch}.`,
                                      "This layer uses the newest synced Pieces context for the summary and chat views.",
                                    ]).map((note, index) => (
                                  <div key={`${note}-${index}`} className="flex items-start gap-2 text-sm text-foreground/80">
                                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                                    <span>{note}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/60 bg-background/80 p-4">
                          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Timeline
                          </div>
                          <div className="space-y-3">
                            {telemetry.slice(0, 4).map((entry) => {
                              const entrySnippets = parseSnippets(entry.code_snippets);
                              return (
                                <div key={entry.id} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-semibold text-primary">
                                      {entry.branch}
                                    </span>
                                    <span className="text-[10px] font-mono text-muted-foreground">
                                      {timeSince(entry.timestamp)}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-xs leading-relaxed text-foreground/75">
                                    {extractSnippetPreview(
                                      entrySnippets[0] ?? "No raw snippet available for this telemetry record.",
                                    )}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeLayer === "snippet" && (
                  <motion.div
                    key="snippet-tab"
                    exit={{ opacity: 0, y: -8 }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-muted/5 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-5 py-3 bg-muted/10 border-b border-border/50">
                      <div className="flex items-center gap-3">
                        <Search className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary">
                          Layer 2 :: Depth Inspection
                        </span>
                      </div>
                      {clickedPhrase && (
                        <button
                          type="button"
                          onClick={() => {
                            setClickedPhrase(null);
                            setDepthExplanation("");
                            setDepthReferences([]);
                            setActiveLayer("brief");
                          }}
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronRight className="h-3 w-3 rotate-180" />
                          Back to Brief
                        </button>
                      )}
                    </div>
                    <div className="p-5 space-y-5">

                      {/* ── Phrase Deep Dive Card ── */}
                      {clickedPhrase && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-primary/10 border-b border-primary/20">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-3.5 w-3.5 text-primary" />
                              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary">
                                Deep Dive: {clickedPhrase}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setClickedPhrase(null);
                                setDepthExplanation("");
                                setDepthReferences([]);
                              }}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="p-5">
                            {depthLoading ? (
                              <div className="space-y-4 py-4">
                                <div className="flex items-center gap-3">
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                  <span className="font-mono uppercase tracking-widest text-[10px] text-muted-foreground animate-pulse">
                                    Retrieving contextual explanation for "{clickedPhrase}"...
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  <Skeleton className="h-4 w-full" />
                                  <Skeleton className="h-4 w-11/12" />
                                  <Skeleton className="h-4 w-5/6" />
                                  <Skeleton className="h-3 w-0" />
                                  <Skeleton className="h-4 w-full" />
                                  <Skeleton className="h-4 w-4/6" />
                                </div>
                              </div>
                            ) : depthExplanation ? (
                              <div className="space-y-5">
                                {/* ── Markdown body ── */}
                                <div className="prose prose-invert prose-sm max-w-none [&_p]:text-foreground/85 [&_p]:leading-relaxed [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_h1]:uppercase [&_h2]:uppercase [&_h3]:uppercase [&_h1]:tracking-widest [&_h2]:tracking-widest [&_h3]:tracking-widest [&_h1]:text-primary [&_h2]:text-primary [&_h3]:text-primary/80 [&_li]:text-foreground/80 [&_li]:text-sm [&_li::marker]:text-primary/50 [&_strong]:text-primary [&_a]:text-primary [&_a]:underline [&_blockquote]:border-primary/30 [&_blockquote]:text-muted-foreground [&_hr]:border-border/40">
                                  <Markdown
                                    components={{
                                      code(props) {
                                        const { children, className, ...rest } = props;
                                        const match = /language-(\w+)/.exec(className || "");
                                        const codeString = String(children).replace(/\n$/, "");
                                        return match ? (
                                          <SyntaxHighlighter
                                            style={oneDark}
                                            language={match[1]}
                                            PreTag="div"
                                            className="!rounded-lg !border !border-border/60 !bg-[#1a1a2e] !text-[11px] !my-3"
                                          >
                                            {codeString}
                                          </SyntaxHighlighter>
                                        ) : (
                                          <code
                                            {...rest}
                                            className="rounded px-1.5 py-0.5 bg-muted/30 border border-border/40 text-primary text-[11px] font-mono"
                                          >
                                            {children}
                                          </code>
                                        );
                                      },
                                    }}
                                  >
                                    {depthExplanation}
                                  </Markdown>
                                </div>

                                {/* ── Citation References ── */}
                                {depthReferences.length > 0 && (
                                  <div className="space-y-3 pt-2 border-t border-border/40">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                                      <Layers3 className="h-3 w-3" />
                                      Referenced Sources ({depthReferences.length})
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      {depthReferences.map((ref) => (
                                        <div
                                          key={ref.id}
                                          className="rounded-lg border border-border/50 bg-background/80 p-3 space-y-1.5 hover:border-primary/30 transition-colors"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <span className="text-[10px] font-mono font-bold text-primary">
                                              [{ref.id}]
                                            </span>
                                            {ref.technology && (
                                              <Badge variant="outline" className="text-[8px] shrink-0 border-primary/30 text-primary/80">
                                                {ref.technology}
                                              </Badge>
                                            )}
                                          </div>
                                          <p className="text-[11px] font-semibold text-foreground/90 leading-snug">
                                            {ref.title}
                                          </p>
                                          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                                            {ref.snippet}
                                          </p>
                                          {ref.timestamp && (
                                            <span className="text-[9px] font-mono text-muted-foreground/60">
                                              {ref.timestamp}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">
                                No explanation available.
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {/* ── Empty state when no phrase selected ── */}
                      {!clickedPhrase && (
                        <div className="rounded-lg border border-dashed border-border/60 bg-background/50 p-6 text-center space-y-2">
                          <Search className="h-6 w-6 text-muted-foreground/30 mx-auto" />
                          <p className="text-xs text-muted-foreground">
                            Click a <span className="text-primary font-semibold">highlighted term</span> in the Brief tab to inspect it here.
                          </p>
                        </div>
                      )}

                      {/* ── Raw Snippets with metadata chips ── */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Raw Telemetry Snippets
                          </div>
                          {snippetMetadata.branchIntent && (
                            <Badge variant="outline" className="text-[8px] border-primary/30 text-primary/80">
                              {snippetMetadata.branchIntent}
                            </Badge>
                          )}
                        </div>
                        {snippetMetadata.technologies.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {snippetMetadata.technologies.map((tech) => (
                              <span
                                key={tech}
                                className="inline-flex items-center rounded-md bg-muted/30 border border-border/50 px-2 py-0.5 text-[9px] font-mono font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors cursor-default"
                              >
                                {tech}
                              </span>
                            ))}
                          </div>
                        )}
                        {snippetMetadata.decisions.length > 0 && (
                          <div className="space-y-1.5">
                            {snippetMetadata.decisions.map((decision, dIdx) => (
                              <div key={dIdx} className="flex items-start gap-2 text-[10px] text-foreground/70">
                                <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-amber-500/70" />
                                <span className="italic">{decision}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {latestSnippets.length > 0 ? (
                          latestSnippets.map((snippet, sIdx) => (
                            <div key={sIdx} className="rounded-lg bg-background border border-border/60 overflow-hidden">
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border/40">
                                <Code2 className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                                  Snippet {sIdx + 1}
                                </span>
                              </div>
                              <pre className="p-3 text-[11px] font-mono text-foreground/85 whitespace-pre-wrap break-words leading-relaxed max-h-72 overflow-y-auto">
                                {snippet}
                              </pre>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            No code snippets in this telemetry entry.
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeLayer === "chat" && (
                  <motion.div
                    key="chat-tab"
                    exit={{ opacity: 0, y: -8 }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-muted/5 overflow-hidden"
                  >
                    <div className="flex items-center gap-3 px-5 py-3 bg-muted/10 border-b border-border/50">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary">
                        Layer 3 :: Contextual Chat
                      </span>
                    </div>

                    <div className="space-y-4 p-5">
                      {/* ── Context Scope Toggle ── */}
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/20 border border-border/60 w-fit">
                        <button
                          type="button"
                          onClick={() => setChatScope("member")}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                            chatScope === "member"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          <Signal className="h-3 w-3" />
                          This Member Only
                        </button>
                        <button
                          type="button"
                          onClick={() => setChatScope("team")}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                            chatScope === "team"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          }`}
                        >
                          <Users className="h-3 w-3" />
                          Team Context
                        </button>
                      </div>

                      {chatHistory.length === 0 && !chatLoading && (
                        <div className="rounded-lg border border-border/60 bg-background/80 p-4">
                          <p className="text-sm leading-relaxed text-foreground/80">
                            {chatScope === "member"
                              ? `Ask about ${displayName}'s recent activity, changes, or Pieces context. Responses are scoped to this member's telemetry only.`
                              : "Ask any question using the full team RAG context. Responses draw from all indexed Pieces workstream data across the team."}
                          </p>
                        </div>
                      )}

                      <div className="space-y-3">
                        {chatHistory.map((message) => (
                          <div
                            key={message.id}
                            className={`rounded-lg border p-4 ${
                              message.role === "ai"
                                ? "border-primary/20 bg-primary/5"
                                : "border-border/60 bg-background/80"
                            }`}
                          >
                            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {message.role === "ai" ? "Sentinel" : displayName}
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                              {message.content}
                            </p>
                            {message.references && message.references.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {message.references.map((reference) => (
                                  <div key={`${message.id}-${reference.id}`} className="rounded-md border border-border/50 bg-background/80 p-3">
                                    <div className="text-[11px] font-medium text-foreground">
                                      [{reference.id}] {reference.title || "Context"}
                                    </div>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                      {reference.snippet}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}

                        {chatLoading && (
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-sm text-primary">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {chatScope === "member"
                                ? `Generating a context-aware answer scoped to ${displayName}'s telemetry.`
                                : "Querying the full team RAG pipeline for a comprehensive answer."}
                            </div>
                            <div className="space-y-2">
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-5/6" />
                              <Skeleton className="h-3 w-3/4" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                        {/* ── Scope-aware context label ── */}
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Ask About This Context
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {chatScope === "member" ? (
                              <>
                                <Signal className="h-3 w-3 text-primary" />
                                <span>Chatting with <span className="font-semibold text-primary">{displayName}'s</span> context</span>
                              </>
                            ) : (
                              <>
                                <Users className="h-3 w-3 text-primary" />
                                <span>Chatting with full <span className="font-semibold text-primary">Team</span> context</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <textarea
                            value={chatMessage}
                            onChange={(event) => setChatMessage(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void handleSendChat();
                              }
                            }}
                            rows={3}
                            placeholder={
                              chatScope === "member"
                                ? `What should I understand from ${displayName}'s latest Pieces context?`
                                : "Ask anything — responses draw from the full team's indexed data."
                            }
                            className="min-h-[92px] flex-1 resize-none rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSendChat()}
                            disabled={chatLoading || chatMessage.trim().length === 0}
                            className="inline-flex h-11 items-center gap-2 self-end rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {chatLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            Send
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
