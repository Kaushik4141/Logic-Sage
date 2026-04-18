import React, { useState } from "react";
import { 
  GitBranch, 
  GitCommit, 
  Ticket, 
  Activity, 
  Zap, 
  History, 
  Layout, 
  ArrowRight,
  Database,
  Search,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCcw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { mockGitBlueprints, mockJiraTicket, type GitBlueprint } from "@/lib/mockJiraData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export function DocumentationTab() {
  const [showJiraTicket, setShowJiraTicket] = useState(false);
  const [hydratedBlueprint, setHydratedBlueprint] = useState<GitBlueprint | null>(null);
  const [blueprints, setBlueprints] = useState<GitBlueprint[]>(mockGitBlueprints);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSimulateWebhook = () => {
    setShowJiraTicket(true);
    // Automatically find and inject the matching blueprint into the Jira workspace
    const match = blueprints.find(bp => bp.id === mockJiraTicket.blueprintId);
    if (match) {
      setTimeout(() => {
        setHydratedBlueprint(match);
      }, 800);
    }
  };

  const handleSimulateGitCommit = async () => {
    setIsGenerating(true);
    try {
      const dummyTelemetry = `
        // File: src/services/telemetry_sink.ts
        export async function flushBuffer(data: TelemetryPacket[]) {
          const startTime = performance.now();
          // Added LRU caching logic to prevent OOM on high-frequency spikes
          const cached = await lru.get(data.id);
          if (cached) return cached;
          
          const result = await db.insert(data);
          console.log(\`[Sink] Flushed \${data.length} packets in \${performance.now() - startTime}ms\`);
          return result;
        }
      `;

      const response = await fetch('http://localhost:3000/api/blueprints/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_name: "fix/telemetry-bottleneck",
          raw_telemetry: dummyTelemetry
        })
      });

      const json = await response.json();
      if (json.status === 'success') {
        const newBp: GitBlueprint = {
          id: `bp-${Date.now()}`,
          branch: "fix/telemetry-bottleneck",
          commitHash: Math.random().toString(16).substring(2, 9),
          author: "Principal AI (Cerebras)",
          summary: json.data.summary,
          key_context: json.data.key_context,
          timestamp: new Date().toISOString()
        };
        setBlueprints([newBp, ...blueprints]);
      }
    } catch (err) {
      console.error("Failed to generate blueprint:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-background min-h-0 min-w-0">
      {/* Left Pane: Git Context History */}
      <div className="w-1/3 border-r border-border flex flex-col bg-muted/5 min-h-0">
        <div className="p-4 border-b border-border bg-background/50 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
                Git_Context_Stream
              </h3>
            </div>
            <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
              {blueprints.length} Commits
            </Badge>
          </div>

          <button
            onClick={handleSimulateGitCommit}
            disabled={isGenerating}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-tight transition-all border",
              isGenerating
                ? "bg-primary/10 border-primary/20 text-primary cursor-wait"
                : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCcw className="h-3 w-3" />
            )}
            Simulate Git Commit Context
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            <AnimatePresence mode="popLayout">
              {blueprints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((bp, idx) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: -20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  key={bp.id}
                className="group relative p-4 rounded-xl border border-border bg-background hover:border-primary/30 transition-all cursor-default"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      <GitCommit className="h-3.5 w-3.5" />
                    </div>
                    <code className="text-[10px] font-mono font-bold text-muted-foreground group-hover:text-primary transition-colors">
                      {bp.commitHash}
                    </code>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/60">
                    {new Date(bp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <h4 className="text-xs font-bold text-foreground mb-1 line-clamp-1">{bp.branch}</h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                  {bp.summary}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {bp.key_context.map((ctx, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-muted/50 border border-border text-[9px] text-muted-foreground font-medium">
                      {ctx}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Right Pane: Active Jira Workspace */}
      <div className="flex-1 flex flex-col bg-background relative overflow-hidden min-h-0">
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--primary) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        
        <header className="p-4 border-b border-border bg-background/50 backdrop-blur-sm z-10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Layout className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
              Active_Jira_Workspace
            </h3>
          </div>
          
          <button
            onClick={handleSimulateWebhook}
            disabled={showJiraTicket}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all border",
              showJiraTicket 
                ? "bg-muted text-muted-foreground border-border cursor-not-allowed" 
                : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 shadow-lg shadow-primary/5 active:scale-95"
            )}
          >
            <Activity className={cn("h-3 w-3", !showJiraTicket && "animate-pulse")} />
            Simulate Jira Webhook
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 relative z-10">
          <AnimatePresence mode="wait">
            {!showJiraTicket ? (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="p-6 rounded-3xl bg-muted/20 border border-dashed border-border mb-4">
                  <Ticket className="h-12 w-12 text-muted-foreground/20" />
                </div>
                <div className="space-y-2 max-w-xs">
                  <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">Waiting for Ticket</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Connect Sentinel to your Jira instance to begin predictive knowledge injection.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="active-ticket"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto space-y-8"
              >
                {/* Ticket Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-mono font-black text-primary/40">{mockJiraTicket.id}</span>
                    <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-2 py-0 text-[10px]">{mockJiraTicket.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Updated 2m ago</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">{mockJiraTicket.title}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 p-4 rounded-xl border border-border/50">
                    {mockJiraTicket.description}
                  </p>
                </div>

                {/* Hydrated Context Area */}
                <AnimatePresence>
                  {hydratedBlueprint && (
                    <motion.div
                      initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      className="relative mt-12"
                    >
                      {/* Section Header with Glow */}
                      <div className="flex items-center gap-4 mb-6 relative">
                        <div className="absolute -left-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-[40px] animate-pulse pointer-events-none" />
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse">
                          <Zap className="h-3 w-3 fill-current" />
                          Context Hydrated
                        </div>
                        <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
                      </div>

                      <div className="bg-gradient-to-br from-primary/[0.03] to-background border border-primary/20 rounded-2xl p-6 shadow-2xl shadow-primary/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12 transition-transform group-hover:scale-110 group-hover:rotate-0 duration-700">
                          <Database className="h-32 w-32" />
                        </div>

                        <div className="space-y-6 relative z-10">
                          <div className="flex items-start gap-4 pb-6 border-b border-primary/10">
                            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                              <Search className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h5 className="text-xs font-bold uppercase tracking-widest text-primary/80 mb-2">Sentinel Insight: Related Context Found</h5>
                              <p className="text-[13px] text-foreground leading-relaxed font-medium">
                                "{hydratedBlueprint.summary}"
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">Source Artifact</p>
                              <div className="flex items-center gap-2 text-xs font-mono bg-background/50 p-2 rounded border border-border">
                                <GitBranch className="h-3 w-3 text-primary" />
                                {hydratedBlueprint.branch}
                              </div>
                            </div>
                            <div className="space-y-2 text-right">
                              <p className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">Original Author</p>
                              <div className="text-xs font-medium text-foreground">{hydratedBlueprint.author}</div>
                            </div>
                          </div>

                          <div className="space-y-3 pt-2">
                            <p className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">Knowledge Tokens to Inject</p>
                            <div className="flex flex-wrap gap-2">
                              {hydratedBlueprint.key_context.map((ctx, i) => (
                                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/5 border border-primary/10 text-[11px] text-primary font-bold">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {ctx}
                                </div>
                              ))}
                            </div>
                          </div>

                          <button className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]">
                            Inject Blueprint to Workspace
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
