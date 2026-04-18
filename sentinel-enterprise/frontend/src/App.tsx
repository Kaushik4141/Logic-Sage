import React, { useEffect, useRef, useState } from "react";
import { checkPiecesConnection } from "./lib/pieces";
import { runLocalCapture } from "./lib/captureLoop";
import { askSentinelAI, type RagReference } from "./lib/api";
import { syncTelemetryToCloud } from "./lib/cloudSync";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Users,
  Search,
  Shield,
  Terminal,
  Loader2,
  LayoutGrid,
  Library,
  Server,
  Globe,
  FileCode,
  Layers,
  Code2,
  Send,
  Paperclip,
  Smile,
  Command,
  CloudUpload,
  ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { MemberProfile } from "@/components/MemberProfile";
import { Sidebar } from "@/components/Sidebar";

const MOCK_TEAM_CONTEXT = [
  { id: 1, name: "David", role: "Backend Engineer", department: "Architecture", status: "Editing", file: "src/api/auth.ts", time: "Just now", isLive: true, avatar: "https://github.com/shadcn.png", branch: "feature/auth-refactor", uptime: "04:12:33", tasks: ["Implement OAuth2 providers", "Secure session tokens", "DB migration scripts"] },
  { id: 2, name: "Sarah", role: "Frontend Lead", department: "Interface", status: "Viewing", file: "components/Button.tsx", time: "2 min ago", isLive: false, avatar: "https://github.com/leerob.png", branch: "mainline/core-sync", uptime: "02:45:10", tasks: ["Button interaction states", "Review PR #412", "Update design tokens"] },
  { id: 3, name: "Alex", role: "DevOps Engineer", department: "Platform Ops", status: "Idle", file: "docker-compose.yml", time: "1 hr ago", isLive: false, avatar: "https://github.com/evilrabbit.png", branch: "infra/k8s-cluster", uptime: "12:00:00", tasks: ["Deploy staging servers", "Rotate CI/CD secrets", "Monitor cluster health"] }
];

interface ChatMessage {
  id: number;
  role: "user" | "ai";
  content: string;
  references?: RagReference[];
}

const CHAT_STARTERS = [
  "Why is the authentication flow failing right now?",
  "What technology is this answer referring to?",
  "Summarize the latest teammate code changes.",
];

export default function App() {
  const [activeTab, setActiveTab] = useState("summary");
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isChatAtBottom, setIsChatAtBottom] = useState(true);

  function scrollChatToBottom() {
    const viewport = chatScrollRef.current;
    if (!viewport) return;

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    if (activeTab !== "chat") return;
    scrollChatToBottom();
  }, [activeTab, chatHistory, isLoading]);

  useEffect(() => {
    if (activeTab !== "chat") return;

    const viewport = chatScrollRef.current;
    if (!viewport) return;

    const updateScrollState = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setIsChatAtBottom(distanceFromBottom < 64);
    };

    updateScrollState();
    viewport.addEventListener("scroll", updateScrollState);

    return () => viewport.removeEventListener("scroll", updateScrollState);
  }, [activeTab, chatHistory.length, isLoading]);

  useEffect(() => {
    const runPiecesHealthCheck = async () => {
      const status = await checkPiecesConnection();
      console.info("[Pieces OS] Connection status:", status);
    };

    void runPiecesHealthCheck();
  }, []);

  useEffect(() => {
    const runCapture = async () => {
      try {
        await runLocalCapture();
        console.info("[Capture Loop] Local capture written to sentinel-local.db");
      } catch (error) {
        console.error("[Capture Loop] Failed to run local capture", error);
      }
    };

    void runCapture();
    const intervalId = window.setInterval(() => {
      void runCapture();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleSyncSuccess = (e: Event) => {
      const customEvent = e as CustomEvent<{ time: Date }>;
      if (customEvent.detail?.time) {
        // Event received
      }
    };
    window.addEventListener('cloud-sync-success', handleSyncSuccess);
    return () => window.removeEventListener('cloud-sync-success', handleSyncSuccess);
  }, []);



  async function handleSendMessage(query: string) {
    if (!query.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: query.trim(),
    };

    setChatHistory((prev) => [...prev, userMessage]);
    setMessage("");
    setIsLoading(true);

    try {
      const aiResponse = await askSentinelAI(query.trim());
      const aiMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "ai",
        content: aiResponse.text,
        references: aiResponse.references,
      };
      setChatHistory((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "ai",
        content: `⚠️ Error: ${error instanceof Error ? error.message : "Failed to reach Sentinel AI backend."}`,
      };
      setChatHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCloudSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncTelemetryToCloud();
      console.log("[Cloud Sync] Successfully pushed to Cloudflare D1");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Cloud Sync] Push failed:", errorMessage);
      alert(`Sentinel Sync Failed:\n\n${errorMessage}`);
    } finally {
      setIsSyncing(false);
    }
  }

  function handleComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    void handleSendMessage(message);
  }

function renderMessageContent(content: string, references: RagReference[] = []) {
    const referencesById = new Map(references.map((reference) => [reference.id, reference]));
    const parts = content.split(/(\[\d+\](?:\[\d+\])*)/g).filter(Boolean);

    return parts.map((part, index) => {
      const matchesCitation = /^(\[\d+\])+$/g.test(part);

      if (!matchesCitation) {
        return <span key={`${part}-${index}`}>{part}</span>;
      }

      const ids = [...part.matchAll(/\[(\d+)\]/g)]
        .map((match) => Number(match[1]))
        .filter((id, citationIndex, allIds) => allIds.indexOf(id) === citationIndex)
        .filter((id) => referencesById.has(id));

      if (ids.length === 0) {
        return <span key={`${part}-${index}`}>{part}</span>;
      }

      return (
        <span key={`${part}-${index}`} className="mx-1 inline-flex flex-wrap items-center gap-1 align-middle">
          {(() => {
            const primaryReference = referencesById.get(ids[0])!;
            const extraCount = ids.length - 1;
            const displayTitle = primaryReference.technology ?? primaryReference.title ?? "Technology";
            const compactLabel = displayTitle.length > 16
              ? `${displayTitle.slice(0, 16)}...`
              : displayTitle;
            const titleText = ids
              .map((id) => {
                const reference = referencesById.get(id)!;
                const referenceTitle = reference.technology ?? reference.title ?? "Technology";
                return `[${reference.id}] ${referenceTitle}${reference.timestamp ? ` • ${reference.timestamp}` : ""}\n${reference.details ?? reference.snippet}`;
              })
              .join("\n\n");

            return (
              <span
                title={titleText}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
              >
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-foreground">
                  {primaryReference.id}
                </span>
                <span>{compactLabel}</span>
                {extraCount > 0 && (
                  <span className="text-[9px] text-muted-foreground/80">+{extraCount}</span>
                )}
              </span>
            );
          })()}
        </span>
      );
    });
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="dark h-screen w-full bg-background text-foreground font-sans overflow-hidden flex">
           

        {/* Main Content Areas */}
        <main className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left Panel: Sidebar */}
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

            {/* Right Panel: Main Interface */}
            <div className="flex-1 bg-background flex flex-col min-h-0 w-full relative">
              <div className="flex-1 flex flex-col relative overflow-hidden min-h-0">
                {/* Header */}
                <header className="flex h-11 items-center justify-between px-6 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-10 font-sans shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
                       <LayoutGrid className="h-3 w-3" />
                       <span>Root</span>
                       <span className="text-border">/</span>
                       <span className={cn(
                          "transition-colors",
                          activeTab === "summary" ? "text-foreground" : "text-muted-foreground"
                       )}>
                          {activeTab === "summary" ? "Project_Manifest" : activeTab.toUpperCase()}
                       </span>
                    </div>
                    <Separator orientation="vertical" className="h-3 mx-1" />
                    <div className="flex -space-x-1.5">
                      {MOCK_TEAM_CONTEXT.map(m => (
                        <Avatar key={m.id} className="h-4 w-4 border border-background ring-1 ring-border">
                          <AvatarImage src={m.avatar} />
                        </Avatar>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-muted/30 border border-border">
                       <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" />
                       <span className="text-[10px] font-mono text-muted-foreground uppercase">Sync_Ok</span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => void handleCloudSync()}
                          disabled={isSyncing}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all border",
                            isSyncing
                              ? "border-primary/30 bg-primary/10 text-primary cursor-wait"
                              : "border-border bg-muted/30 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                          )}
                        >
                          {isSyncing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CloudUpload className="h-3 w-3" />
                          )}
                          <span className="hidden sm:inline">{isSyncing ? "Pushing..." : "Push to Cloud"}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Push latest telemetry to Enterprise Cloud (D1)</TooltipContent>
                    </Tooltip>
                  </div>
                </header>

            {activeTab === "summary" && (
              /* Summary View - Mission Control Aesthetic */
              <div className="flex-1 flex flex-col overflow-hidden bg-background min-h-0">
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-8 max-w-6xl mx-auto space-y-10">
                    {/* Title Section */}
                    <div className="flex flex-col gap-2 border-l-2 border-primary pl-6 py-1">
                      <h1 className="text-2xl font-bold tracking-tight text-foreground uppercase tracking-wider">System_Manifest :: Core_Platform</h1>
                      <p className="text-muted-foreground text-[13px] leading-relaxed max-w-2xl font-sans">
                        Authenticated session for high-priority engineering orchestration.
                        Managing state synchronization and identity propagation across Sentinel nodes.
                      </p>
                    </div>

                    {/* 01: DOCUMENTATION: PROJECT OVERVIEW & OBJECTIVES */}
                    <section className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 shrink-0">
                          <Library className="h-3 w-3" />
                          Project Specification & Documentation
                        </h3>
                        <div className="h-px flex-1 bg-border" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold uppercase text-foreground/80 tracking-widest border-b border-border pb-2 font-mono">01_Overview</h4>
                          <div className="text-[13px] text-muted-foreground leading-relaxed font-sans space-y-3">
                            <p>Sentinel Enterprise is a high-availability orchestration layer designed specifically for decentralized development teams. It serves as the primary "Truth Engine" for synchronizing complex application states across distributed environments.</p>
                            <p>The platform implements a proprietary <strong>Synapse Proxy</strong> logic that mitigates race conditions in real-time collaboration, ensuring that every node in the cluster has a cryptographically verified view of the project state at any given timestamp.</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold uppercase text-foreground/80 tracking-widest border-b border-border pb-2 font-mono">02_System_Objectives</h4>
                          <ul className="space-y-2">
                            {[
                              "Real-time state propagation with < 50ms global latency.",
                              "Immutable event logging for all administrative actions.",
                              "Automated resource orchestration via Sentinel CLI integration.",
                              "Tier-III identity verification and session anchoring."
                            ].map((obj, i) => (
                              <li key={i} className="flex items-start gap-3 text-[12px] text-muted-foreground">
                                <div className="h-1 w-1 rounded-full bg-primary mt-1.5 shrink-0" />
                                <span>{obj}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </section>

                    {/* 02: SYSTEM ARCHITECTURE (TECH STACK) */}
                    <section className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 shrink-0">
                          <Layers className="h-3 w-3" />
                          System Architecture & Node Blueprint
                        </h3>
                        <div className="h-px flex-1 bg-border" />
                      </div>

                      <p className="text-[13px] text-muted-foreground leading-relaxed font-sans max-w-3xl">
                        System architecture is the high-level conceptual model that defines the structure, behaviour, and views of a system. It serves as a master blueprint, outlining how hardware and software components, interfaces, and security layers work together to meet specific business and technical goals.
                      </p>

                      <div className="pt-8 relative">
                        {/* Professional Technical Schematic */}
                        <div className="flex flex-col items-center">
                          {/* Step 1: Access Tier */}
                          <div className="w-full max-w-2xl bg-muted/20 border border-border rounded-lg p-6 relative">
                            <div className="absolute -top-3 left-4 px-2 bg-background border border-border rounded text-[10px] font-mono uppercase tracking-tight text-foreground/70">Layer_01 // External_Access</div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="border border-border bg-background p-3 rounded flex items-center gap-3">
                                <Globe className="h-4 w-4 text-muted-foreground" />
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-bold uppercase tracking-tight">Web_Endpoint</p>
                                  <p className="text-[9px] text-muted-foreground">HTTPS/WSS Protocol</p>
                                </div>
                              </div>
                              <div className="border border-border bg-background p-3 rounded flex items-center gap-3 opacity-50">
                                <Globe className="h-4 w-4 text-muted-foreground" />
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-bold uppercase tracking-tight">API_Gateway</p>
                                  <p className="text-[9px] text-muted-foreground">REST Integration</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Connector Line 1 */}
                          <div className="h-10 w-px bg-border flex items-center justify-center">
                            <div className="bg-background border border-border px-2 py-0.5 rounded text-[8px] font-mono text-muted-foreground uppercase">Request_Flow</div>
                          </div>

                          {/* Step 2: Identity Layer */}
                          <div className="w-full max-w-2xl bg-muted/20 border border-border rounded-lg p-6 relative">
                            <div className="absolute -top-3 left-4 px-2 bg-background border border-border rounded text-[10px] font-mono uppercase tracking-tight text-foreground/70">Layer_02 // Security_&_Identity</div>
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { t: "OAuth_Service", d: "Identity Verification" },
                                { t: "JWT_Validator", d: "Session Management" },
                                { t: "RBAC_Engine", d: "Permission Scoping" }
                              ].map((item, i) => (
                                <div key={i} className="border border-border bg-background p-3 rounded group hover:border-foreground/20 transition-colors">
                                  <Shield className="h-3.5 w-3.5 mb-2 text-muted-foreground" />
                                  <p className="text-[10px] font-bold uppercase tracking-tight">{item.t}</p>
                                  <p className="text-[9px] text-muted-foreground">{item.d}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Connector Line 2 */}
                          <div className="h-10 w-px bg-border flex items-center justify-center">
                            <div className="bg-background border border-border px-2 py-0.5 rounded text-[8px] font-mono text-muted-foreground uppercase">Validated_Pipe</div>
                          </div>

                          {/* Step 3: Application Core */}
                          <div className="w-full max-w-2xl bg-muted/30 border-2 border-border rounded-lg p-8 relative">
                            <div className="absolute -top-3 left-4 px-2 bg-background border border-border rounded text-[10px] font-mono uppercase tracking-tight text-foreground font-semibold">Layer_03 // Application_Orchestrator</div>
                            <div className="flex flex-col gap-6">
                              <div className="grid grid-cols-2 gap-6">
                                <div className="border border-border bg-background p-4 rounded-md space-y-2">
                                  <div className="flex items-center gap-2 border-b border-border pb-2 mb-2">
                                    <Terminal className="h-3.5 w-3.5 text-primary" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">State_Manager</span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                                    Handles complex state transitions and reactive updates across the node cluster.
                                  </p>
                                </div>
                                <div className="border border-border bg-background p-4 rounded-md space-y-2">
                                  <div className="flex items-center gap-2 border-b border-border pb-2 mb-2">
                                    <Layers className="h-3.5 w-3.5 text-primary" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Sync_Engine</span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                                    Synchronizes internal manifests with physical cloud resources in real-time.
                                  </p>
                                </div>
                              </div>
                              <div className="bg-background border border-dashed border-border p-4 rounded-md flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Server className="h-4 w-4 text-muted-foreground" />
                                  <div className="space-y-0.5">
                                    <p className="text-[10px] font-bold uppercase tracking-tight">Primary_Data_Sink</p>
                                    <p className="text-[9px] text-muted-foreground font-mono">POSTGRESQL // PERSISTENCE_LAYER</p>
                                  </div>
                                </div>
                                <Badge variant="outline" className="text-[8px] h-4 font-mono">STABLE</Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 03: THINGS DONE (MILESTONES / CHANGELOG) */}
                    <section className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 shrink-0">
                          <FileCode className="h-3 w-3" />
                          Mission Progress & Completed Milestones
                        </h3>
                        <div className="h-px flex-1 bg-border" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                          {
                            title: "Core Architecture",
                            status: "Verified",
                            tasks: ["Orchestration Engine", "Synapse Proxy v1", "Identity Provider"]
                          },
                          {
                            title: "Interface Layer",
                            status: "Authenticated",
                            tasks: ["Mission Control UI", "Live State Sink", "Contextual Sidebar"]
                          },
                          {
                            title: "Security Matrix",
                            status: "Enforced",
                            tasks: ["AES-256 Anchorage", "Tier-III Verification", "Audit Logging"]
                          }
                        ].map((milestone, i) => (
                          <div key={i} className="p-5 rounded-lg border border-border bg-background space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[11px] font-bold uppercase tracking-widest text-foreground">{milestone.title}</h4>
                              <Badge variant="outline" className="text-[8px] h-4 bg-primary/5 text-primary border-primary/20">{milestone.status}</Badge>
                            </div>
                            <ul className="space-y-2">
                              {milestone.tasks.map((task, j) => (
                                <li key={j} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <div className="h-1 w-1 rounded-full bg-green-500" />
                                  {task}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* 04: PEOPLE: LIVE CONTEXT MONITORING */}
                    <section className="space-y-6 pb-12">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2 shrink-0">
                          <Users className="h-3 w-3" />
                          Active Operators & Contributors
                        </h3>
                        <div className="h-px flex-1 bg-border" />
                      </div>

                      <div className="space-y-[1px] bg-border border border-border rounded-lg overflow-hidden shadow-lg">
                        {MOCK_TEAM_CONTEXT.map((member) => (
                          <motion.div
                            key={member.id}
                            className="bg-background p-4 flex items-center gap-6 group hover:bg-muted/10 transition-colors relative"
                          >
                            <div className="relative shrink-0">
                              <Avatar className="h-9 w-9 border border-border shadow-sm">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback>{member.name[0]}</AvatarFallback>
                              </Avatar>
                              {member.isLive && (
                                <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-background animate-pulse" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                              <div className="space-y-0.5">
                                <p className="text-xs font-bold text-foreground truncate">{member.name}</p>
                                <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-tighter opacity-70">UID: 00{member.id}-SNTL</p>
                              </div>

                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    member.status === "Editing" ? "bg-blue-400" : "bg-green-400"
                                  )} />
                                  <p className="text-[11px] font-medium uppercase tracking-tight">{member.status}</p>
                                </div>
                                <code className="text-[10px] font-mono text-muted-foreground underline decoration-border underline-offset-4 truncate block">
                                  {member.file}
                                </code>
                              </div>

                              <div className="flex items-center gap-4 text-right justify-self-end">
                                <div className="hidden md:block text-right">
                                  <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest leading-none mb-1">Last Signal</p>
                                  <p className="text-[10px] font-mono text-foreground/80">{member.time}</p>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); setActiveTab(`member-${member.id}`); }} className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                                  <Search className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  </div>
                </ScrollArea>
              </div>
            )}
                
             {activeTab === "chat" && (
              /* Chat View */
              <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative">
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 z-10">
                  <div className="max-w-3xl mx-auto space-y-6">
                    {chatHistory.length === 0 && !isLoading && (
                      <div className="py-12">
                        <div className="rounded-3xl border border-border/60 bg-gradient-to-b from-primary/[0.07] via-background to-background p-8 shadow-xl shadow-primary/5">
                          <div className="flex flex-col items-center justify-center space-y-4 text-center">
                            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                              <Terminal className="h-8 w-8 text-primary/70" />
                            </div>
                            <div className="space-y-2">
                              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">Sentinel_CLI :: Ready</h3>
                              <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
                                Ask Sentinel about the current codebase, recent teammate work, or a technology mentioned in the answer. Chat responses use your local Pieces context and show technology cards when a citation is needed.
                              </p>
                            </div>
                          </div>
                          <div className="mt-8 grid gap-3 md:grid-cols-3">
                            {CHAT_STARTERS.map((starter) => (
                              <button
                                key={starter}
                                type="button"
                                onClick={() => void handleSendMessage(starter)}
                                className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4 text-left transition hover:border-primary/30 hover:bg-primary/[0.04]"
                              >
                                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                  Quick Ask
                                </div>
                                <div className="mt-2 text-sm leading-relaxed text-foreground/85">
                                  {starter}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <AnimatePresence>
                      {chatHistory.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "flex flex-col gap-2",
                            msg.role === "ai" ? "items-center" : "items-start"
                          )}
                        >
                          {msg.role === "ai" ? (
                            <div className="w-full relative py-6 px-6 rounded-2xl border border-primary/20 bg-primary/5 shadow-xl shadow-primary/5 group overflow-hidden">
                              <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Code2 className="h-16 w-16" />
                              </div>
                              <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 rounded-lg bg-primary/20 border border-primary/30">
                                  <Terminal className="h-4 w-4 text-primary" />
                                </div>
                                <span className="text-xs font-bold tracking-widest uppercase text-primary">Sentinel AI</span>
                              </div>
                              <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                                {renderMessageContent(msg.content, msg.references)}
                              </div>
                              {msg.references && msg.references.length > 0 && (
                                <div className="mt-4 border-t border-primary/10 pt-4">
                                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Technology Cards
                                  </div>
                                  <div className="space-y-2">
                                    {msg.references.map((reference) => (
                                      <div
                                        key={`${msg.id}-${reference.id}`}
                                        className="rounded-xl border border-border/60 bg-background/70 p-3 text-left shadow-sm"
                                      >
                                        <div className="flex items-start gap-3">
                                          {reference.imageUrl ? (
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 p-2">
                                              <img
                                                src={reference.imageUrl}
                                                alt={reference.imageAlt ?? reference.technology ?? "Technology"}
                                                className="h-8 w-8 object-contain"
                                              />
                                            </div>
                                          ) : (
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-gradient-to-br from-primary/15 to-transparent text-sm font-bold text-primary">
                                              {(reference.technology ?? reference.title ?? "T").slice(0, 2).toUpperCase()}
                                            </div>
                                          )}
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                                                [{reference.id}]
                                              </span>
                                              <span className="truncate">
                                                {reference.technology ?? (reference.title || "Technology")}
                                              </span>
                                            </div>
                                            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                              Technology Reference
                                            </p>
                                            <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                                              {reference.details ?? reference.snippet}
                                            </p>
                                            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                                              {reference.snippet}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 px-1">
                                <span className="text-xs font-bold text-foreground">You</span>
                              </div>
                              <div className="relative px-4 py-3 rounded-xl bg-muted/30 border border-border/50 max-w-[85%] group hover:border-border/80 transition-colors">
                                <p className="text-sm text-foreground/80 leading-relaxed font-sans">
                                  {msg.content}
                                </p>
                              </div>
                            </>
                          )}
                        </motion.div>
                      ))}

                      {/* Loading indicator */}
                      {isLoading && (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex flex-col gap-2 items-center"
                        >
                          <div className="w-full relative py-6 px-6 rounded-2xl border border-primary/20 bg-primary/5 shadow-xl shadow-primary/5 overflow-hidden">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 rounded-lg bg-primary/20 border border-primary/30">
                                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                              </div>
                              <span className="text-xs font-bold tracking-widest uppercase text-primary animate-pulse">Sentinel is thinking...</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div ref={chatEndRef} />
                  </div>
                </div>

                {!isChatAtBottom && (
                  <div className="pointer-events-none absolute bottom-32 right-8 z-20">
                    <button
                      type="button"
                      onClick={scrollChatToBottom}
                      className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/95 px-3 py-2 text-xs font-medium text-primary shadow-lg backdrop-blur transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <ChevronDown className="h-4 w-4" />
                      Latest
                    </button>
                  </div>
                )}

                {/* Chat Input Area */}
                <div className="p-4 border-t border-border/50 bg-background/50 backdrop-blur-md z-10">
                  <div className="max-w-3xl mx-auto relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/5 to-primary/0 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSendMessage(message);
                      }}
                      className="relative flex flex-col p-2 rounded-xl border border-border bg-background focus-within:border-primary/50 transition-all shadow-sm"
                      >
                        <div className="flex items-center gap-2 mb-2 px-2">
                          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                            <Paperclip className="h-4 w-4" />
                          </button>
                          <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                            <Smile className="h-4 w-4" />
                          </button>
                          <Separator orientation="vertical" className="h-4" />
                          <Badge variant="outline" className="text-[9px] h-4 font-mono text-muted-foreground border-border/50">Pieces Context</Badge>
                        </div>
                        <div className="flex gap-3 items-end">
                          <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={handleComposerKeyDown}
                            placeholder="Ask Sentinel about your codebase, a teammate change, or a technology in the answer..."
                            disabled={isLoading}
                            rows={3}
                            className="min-h-[88px] flex-1 resize-none rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
                          />
                          <button
                            type="submit"
                            disabled={isLoading || message.trim().length === 0}
                            className={cn(
                              "mb-1 inline-flex h-11 items-center gap-2 rounded-xl bg-muted px-4 text-sm font-medium text-muted-foreground transition-all disabled:opacity-50",
                              message.trim().length > 0 && !isLoading && "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                            )}
                          >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            <span>Send</span>
                          </button>
                        </div>
                    </form>
                  </div>
                  <div className="flex justify-center mt-3">
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
                      <span className="flex items-center gap-1.5"><Command className="h-3 w-3" /> Enter to send</span>
                      <span className="flex items-center gap-1.5">Shift + Enter for newline</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab.startsWith("member-") && (
              <MemberProfile member={MOCK_TEAM_CONTEXT.find(m => m.id === parseInt(activeTab.replace("member-", "")))!} />
            )}

            {activeTab !== "summary" && activeTab !== "chat" && !activeTab.startsWith("member-") && (
              /* Fallback View for other modules */
              <div className="flex-1 flex flex-col items-center justify-center p-12 bg-background min-h-0 relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="text-center space-y-8 max-w-md relative z-10">
                  <div className="relative mx-auto w-fit">
                    <div className="p-5 rounded-2xl bg-muted/30 border border-border shadow-inner">
                      <Terminal className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                    <div className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-20"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-primary/40 border-2 border-background"></span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-foreground">
                      {activeTab.toUpperCase()}_COORDINATES_SYNC
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed font-sans opacity-80">
                      The requested module is awaiting a definitive state broadcast.
                      Protocol handshakes are currently being negotiated with the primary cluster manifest.
                    </p>
                  </div>
                  <div className="pt-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground/60 px-2 uppercase tracking-widest">
                      <span>Negotiation_Status</span>
                      <span className="text-primary/60">PENDING_SIGNAL</span>
                    </div>
                    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary/40"
                        initial={{ width: "30%" }}
                        animate={{ width: "65%" }}
                        transition={{ repeat: Infinity, duration: 3, repeatType: "reverse" }}
                      />
                    </div>
                    <button
                      onClick={() => setActiveTab("summary")}
                      className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] py-3 px-6 rounded-lg border border-border bg-muted/10 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                    >
                      Reset to Manifest
                    </button>
                    <Separator orientation="vertical" className="h-4" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => void handleCloudSync()}
                          disabled={isSyncing}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all border",
                            isSyncing
                              ? "border-primary/30 bg-primary/10 text-primary cursor-wait"
                              : "border-border bg-muted/30 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                          )}
                        >
                          {isSyncing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CloudUpload className="h-3 w-3" />
                          )}
                          <span className="hidden sm:inline">{isSyncing ? "Pushing..." : "Push to Cloud"}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Push latest telemetry to Enterprise Cloud (D1)</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

       
      </div>
    </TooltipProvider>
  );
}
