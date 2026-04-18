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
  Send,
  Signal,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { askSentinelWithContext, getDeveloperBrief, type RagReference } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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

function extractSnippetMetadata(snippets: string[]): { titles: string[]; notes: string[] } {
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

  return { titles, notes };
}

function extractSnippetPreview(snippet: string): string {
  const lines = getSnippetBodyLines(snippet);
  const previewSource =
    lines.find((line) => line.length > 50) ??
    lines[0] ??
    "No meaningful snippet details were available for this telemetry record.";
  return previewSource.replace(/\s+/g, " ").trim().slice(0, 220);
}

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
      developer_id: memberRecord.id,
      developer_name: displayName,
      error_log: latestEntry
        ? `Latest telemetry recorded ${formatTimestamp(latestEntry.timestamp)} on branch ${latestEntry.branch}.`
        : "No recent telemetry available.",
      teammate_recent_code:
        normalizeSnippetText(latestSnippets) || "No recent code snippet available from Pieces OS.",
    }),
    [memberRecord.id, displayName, latestEntry, latestSnippets],
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
      const response = await askSentinelWithContext(prompt, latestContext, latestEntry.branch);
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
          content: `Unable to complete this member-context chat request: ${
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
                    { key: "snippet", label: "Snippet", icon: FileText },
                    { key: "chat", label: "Chat", icon: MessageSquare },
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

                {activeLayer === "brief" && (
                  <motion.div
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
                        <p className="text-sm leading-relaxed text-foreground/85">
                          {briefLoading
                            ? "Generating a concise summary from the latest Pieces data for this developer."
                            : brief || buildFallbackBrief(displayName, latestEntry.branch, latestSnippets)}
                        </p>
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
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-muted/5 overflow-hidden"
                  >
                    <div className="flex items-center gap-3 px-5 py-3 bg-muted/10 border-b border-border/50">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary">
                        Layer 2 :: Raw Snippet
                      </span>
                    </div>
                    <div className="p-5 space-y-3">
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
                  </motion.div>
                )}

                {activeLayer === "chat" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-border bg-muted/5 overflow-hidden"
                  >
                    <div className="flex items-center gap-3 px-5 py-3 bg-muted/10 border-b border-border/50">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary">
                        Layer 3 :: Context Chat
                      </span>
                    </div>

                    <div className="space-y-4 p-5">
                      {chatHistory.length === 0 && !chatLoading && (
                        <div className="rounded-lg border border-border/60 bg-background/80 p-4">
                          <p className="text-sm leading-relaxed text-foreground/80">
                            Ask what this developer was doing, what changed recently, or what the latest Pieces snippet suggests.
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
                          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                            <div className="flex items-center gap-2 text-sm text-primary">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Generating a context-aware answer for this member.
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Ask About This Context
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
                            placeholder="What should I understand from this member's latest Pieces context?"
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
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
