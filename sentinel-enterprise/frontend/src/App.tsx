import React, { useEffect, useState } from "react";
import {
  checkPiecesConnection,
  getRecentCodeSnippets,
  packageLocalContext,
} from "./lib/pieces";
import { runLocalCapture } from "./lib/captureLoop";
import { getLatestTelemetry, getTauriDb } from "./lib/localDb";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { 
  Users, 
  Settings, 
  Search, 
  Shield, 
  Terminal, 
  LineChart,
  Signal,
  MoreVertical,
  LayoutGrid,
  Library,
  Server,
  Globe,
  FileCode,
  Layers,
  Code2,
  Activity,
  Send,
  Paperclip,
  Smile,
  Command
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { MemberProfile } from "@/components/MemberProfile";

const MOCK_TEAM_CONTEXT = [
  { id: 1, name: "David", role: "Backend Engineer", department: "Architecture", status: "Editing", file: "src/api/auth.ts", time: "Just now", isLive: true, avatar: "https://github.com/shadcn.png", branch: "feature/auth-refactor", uptime: "04:12:33", tasks: ["Implement OAuth2 providers", "Secure session tokens", "DB migration scripts"] },
  { id: 2, name: "Sarah", role: "Frontend Lead", department: "Interface", status: "Viewing", file: "components/Button.tsx", time: "2 min ago", isLive: false, avatar: "https://github.com/leerob.png", branch: "mainline/core-sync", uptime: "02:45:10", tasks: ["Button interaction states", "Review PR #412", "Update design tokens"] },
  { id: 3, name: "Alex", role: "DevOps Engineer", department: "Platform Ops", status: "Idle", file: "docker-compose.yml", time: "1 hr ago", isLive: false, avatar: "https://github.com/evilrabbit.png", branch: "infra/k8s-cluster", uptime: "12:00:00", tasks: ["Deploy staging servers", "Rotate CI/CD secrets", "Monitor cluster health"] }
];

const MOCK_MESSAGES = [
  { id: 1, sender: "David (Backend)", content: "Hey Sarah, I just finished the auth endpoint. Can you check if the frontend is receiving the 201 status code correctly?", time: "10:24 AM" },
  { id: 2, sender: "Sarah (Frontend)", content: "On it! I'm currently looking at Button.tsx to see if we need a global transition for the loading state.", time: "10:25 AM" },
  { id: 3, sender: "Sentinel AI", content: "I've detected a potential race condition in `src/api/auth.ts` related to the session storage. Would you like me to analyze the trace?", time: "10:26 AM", isAI: true },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("summary");
  const [message, setMessage] = useState("");

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

  async function handleForceSync() {
    console.info("[Force Sync] Button clicked");
    try {
      await runLocalCapture();

      // Raw Tauri SQL fallback — bypasses Drizzle entirely
      const tauriDb = await getTauriDb();
      const rawResult = await tauriDb.select<Record<string, unknown>[]>(
        "SELECT * FROM local_telemetry ORDER BY id DESC LIMIT 1",
      );
      console.info("[Raw Tauri SQL] Latest telemetry:", rawResult);

      // Drizzle path
      const latestTelemetry = await getLatestTelemetry();

      if (latestTelemetry?.codeSnippets) {
        const parsed = JSON.parse(latestTelemetry.codeSnippets) as string[];
        console.info("[Drizzle DB] Latest telemetry:", {
          ...latestTelemetry,
          codeSnippets: parsed,
        });
      } else {
        console.info("[Drizzle DB] Latest telemetry:", latestTelemetry);
      }
    } catch (error) {
      console.error("[Force Sync] Failed", error);
    }
  }

  return (
    <TooltipProvider delay={0}>
      <div className="dark h-screen w-full bg-background text-foreground font-sans overflow-hidden flex flex-col">
        {/* Top Navbar mimic shadcn sticky header */}
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-12 items-center px-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-bold tracking-tight text-sm">Sentinel</span>
              <Badge variant="secondary" className="bg-muted text-[10px] px-1.5 h-4 font-mono font-medium">Enterprise</Badge>
            </div>
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search project, commands, logs..."
                  className="h-8 w-full bg-muted/50 pl-8 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 border-none"
                />
                <div className="absolute right-2 top-2 hidden items-center space-x-1 sm:flex">
                  <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Tooltip>
                <TooltipTrigger className="text-muted-foreground hover:text-foreground transition-colors">
                  <Signal className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="bottom">System Health</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="h-4" />
              <Avatar className="h-7 w-7 border border-border">
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Main Content Areas */}
        <main className="flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal">
            {/* Left Panel: Sidebar */}
            <ResizablePanel defaultSize={20} minSize={15} className="border-r border-border bg-background flex flex-col min-h-0">
              <div className="p-4 flex flex-col h-full min-h-0">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Live Context
                  </h2>
                  <div className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                </div>
                
                <ScrollArea className="flex-1 -mx-2 px-2 min-h-0">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      {MOCK_TEAM_CONTEXT.map((member) => (
                        <motion.div
                          key={member.id}
                          onClick={() => setActiveTab(`member-${member.id}`)}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cn(
                            "group relative flex items-start gap-3 rounded-md p-2 hover:bg-muted transition-all cursor-pointer",
                            member.isLive && "bg-muted/30",
                            activeTab === `member-${member.id}` && "bg-primary/5 ring-1 ring-primary/20"
                          )}
                        >
                          <Avatar className="h-8 w-8 border border-border/50">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback>{member.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium truncate">{member.name}</p>
                              <span className="text-[10px] text-muted-foreground">{member.time}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={cn(
                                "text-[10px] px-1 rounded-sm",
                                member.status === "Editing" ? "bg-blue-500/10 text-blue-400" :
                                member.status === "Viewing" ? "bg-green-500/10 text-green-400" :
                                "bg-muted text-muted-foreground"
                              )}>
                                {member.status}
                              </span>
                              <p className="text-[10px] text-muted-foreground truncate font-mono">
                                {member.file}
                              </p>
                            </div>
                            {member.isLive && (
                              <div className="absolute right-2 bottom-2">
                                <motion.div 
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ repeat: Infinity, duration: 2 }}
                                  className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
                                />
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <Separator className="my-4 opacity-50" />

                    <div className="space-y-6">
                      <div className="px-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 px-2">Navigation</h3>
                        <nav className="space-y-0.5">
                          <button 
                            onClick={() => setActiveTab("summary")}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs rounded-md transition-all group",
                              activeTab === "summary" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <LayoutGrid className={cn("h-3.5 w-3.5", activeTab === "summary" ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground")} />
                            <span className="font-medium">Manifest</span>
                          </button>
                          <button 
                            onClick={() => setActiveTab("chat")}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs rounded-md transition-all group",
                              activeTab === "chat" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <Terminal className={cn("h-3.5 w-3.5", activeTab === "chat" ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground")} />
                            <span className="font-medium">Team CLI</span>
                          </button>
                        </nav>
                      </div>

                      <div className="px-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 px-2">System</h3>
                        <nav className="space-y-0.5">
                          <button 
                            onClick={() => setActiveTab("settings")}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs rounded-md transition-all group",
                              activeTab === "settings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <Settings className={cn("h-3.5 w-3.5", activeTab === "settings" ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground")} />
                            <span className="font-medium">Configuration</span>
                          </button>
                          <button className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs rounded-md text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-all group cursor-not-allowed">
                            <Shield className="h-3.5 w-3.5 text-muted-foreground/30" />
                            <span className="font-medium">Access Logs</span>
                            <Badge variant="outline" className="ml-auto text-[8px] h-3.5 px-1 border-border text-muted-foreground/40 font-mono">LOCKED</Badge>
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                <div className="mt-auto pt-4 border-t border-border/50">
                  <div className="flex items-center gap-3 px-2 py-1 bg-muted/40 rounded-lg border border-border/50">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-[10px] font-medium text-muted-foreground">Connected to ap-southeast-1</span>
                  </div>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle />

            {/* Right Panel: Main Interface */}
            <ResizablePanel defaultSize={80} className="bg-background flex flex-col min-h-0">
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
                    <button onClick={handleForceSync} className="text-muted-foreground hover:text-foreground transition-all" title="Force Sync">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
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
                     <ScrollArea className="flex-1 p-6 z-10">
                       <div className="max-w-3xl mx-auto space-y-8">
                         <AnimatePresence>
                           {MOCK_MESSAGES.map((msg) => (
                             <motion.div
                               key={msg.id}
                               initial={{ opacity: 0, y: 10 }}
                               animate={{ opacity: 1, y: 0 }}
                               className={cn(
                                 "flex flex-col gap-2",
                                 msg.isAI ? "items-center" : "items-start"
                               )}
                             >
                               {msg.isAI ? (
                                 <div className="w-full relative py-8 px-8 rounded-2xl border border-primary/20 bg-primary/5 shadow-2xl shadow-primary/5 group overflow-hidden">
                                   <div className="absolute top-0 right-0 p-4 opacity-10">
                                     <Code2 className="h-16 w-16" />
                                   </div>
                                   <div className="flex items-center gap-2 mb-4">
                                     <div className="p-1.5 rounded-lg bg-primary/20 border border-primary/30">
                                       <Terminal className="h-4 w-4 text-primary" />
                                     </div>
                                     <span className="text-xs font-bold tracking-widest uppercase text-primary">Sentinel AI Analysis</span>
                                     <Badge variant="outline" className="text-[9px] h-4 border-primary/30 text-primary">Proactive</Badge>
                                   </div>
                                   <p className="text-sm leading-relaxed text-foreground/90 font-medium whitespace-pre-wrap italic">
                                     "{msg.content}"
                                   </p>
                                   <div className="mt-6 flex gap-3">
                                     <button className="text-[10px] px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-bold uppercase tracking-tight hover:opacity-90 transition-opacity flex items-center gap-2">
                                       <Activity className="h-3 w-3" /> Execute Analysis
                                     </button>
                                     <button className="text-[10px] px-3 py-1.5 rounded-md border border-border bg-muted/50 text-muted-foreground font-bold uppercase tracking-tight hover:bg-muted transition-colors">
                                       Dismiss
                                     </button>
                                   </div>
                                 </div>
                               ) : (
                                 <>
                                   <div className="flex items-center gap-2 px-1">
                                     <span className="text-xs font-bold text-foreground">{msg.sender}</span>
                                     <span className="text-[10px] text-muted-foreground">{msg.time}</span>
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
                         </AnimatePresence>
                       </div>
                     </ScrollArea>

                     {/* Chat Input Area */}
                     <div className="p-4 border-t border-border/50 bg-background/50 backdrop-blur-md z-10">
                       <div className="max-w-3xl mx-auto relative group">
                         <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/5 to-primary/0 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                         <div className="relative flex flex-col p-2 rounded-xl border border-border bg-background focus-within:border-primary/50 transition-all shadow-sm">
                           <div className="flex items-center gap-2 mb-2 px-2">
                             <button className="text-muted-foreground hover:text-foreground transition-colors">
                               <Paperclip className="h-4 w-4" />
                             </button>
                             <button className="text-muted-foreground hover:text-foreground transition-colors">
                               <Smile className="h-4 w-4" />
                             </button>
                             <Separator orientation="vertical" className="h-4" />
                             <Badge variant="outline" className="text-[9px] h-4 font-mono text-muted-foreground border-border/50">Markdown Supported</Badge>
                           </div>
                           <div className="flex gap-2">
                             <Input
                               value={message}
                               onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
                               placeholder="Type a message or use / to run a command..."
                               className="border-none bg-transparent focus-visible:ring-0 text-sm h-10 py-0 shadow-none placeholder:text-muted-foreground/50"
                             />
                             <button
                               className={cn(
                                 "p-2 rounded-lg bg-muted text-muted-foreground transition-all flex items-center gap-2",
                                 message.length > 0 && "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                               )}
                             >
                               <Send className="h-4 w-4" />
                             </button>
                           </div>
                         </div>
                       </div>
                       <div className="flex justify-center mt-3">
                         <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
                           <span className="flex items-center gap-1.5"><Command className="h-3 w-3" /> + Enter to send</span>
                           <span className="flex items-center gap-1.5"><span className="text-xs">/</span> for tools</span>
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
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>

        {/* Status Bar */}
        <footer className="h-6 border-t border-border bg-muted/30 flex items-center justify-between px-3 text-[10px] text-muted-foreground pointer-events-none select-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="font-mono">SENTINEL_OK</span>
            </div>
            <span>Vite + Tauri</span>
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>Ln 1, Col 1</span>
            <span>Spaces: 2</span>
            <span>UTF-8</span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
