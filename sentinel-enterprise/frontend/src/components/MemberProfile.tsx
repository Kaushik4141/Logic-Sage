import { 
  Signal, 
  Edit2,
  Check,
  X,
  Loader2,
  Terminal,
  BadgeInfo,
  Activity,
  GitBranch,
  Clock,
  Code2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";

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
    return "–";
  }
}

export function MemberProfile({ member, isLead, onRoleUpdate }: MemberProfileProps) {
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [newRole, setNewRole] = useState(member?.jobTitle || member?.role || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  // Fetch telemetry for this member
  useEffect(() => {
    if (!member?.id) return;
    let mounted = true;
    const fetchTelemetry = async () => {
      setTelemetryLoading(true);
      try {
        const res = await fetch(
          `https://edge-api.kaushik0h0s.workers.dev/api/history/${encodeURIComponent(member.id)}`
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
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [member?.id]);

  if (!member) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground font-mono space-y-4">
        <Terminal className="h-10 w-10 opacity-20" />
        <p className="text-xs uppercase tracking-widest">Awaiting Identity Context...</p>
      </div>
    );
  }

  const handleUpdateRole = async () => {
    if (!onRoleUpdate) return;
    setIsUpdating(true);
    try {
      await onRoleUpdate(member.id, newRole);
      setIsEditingRole(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const displayName = member.name || member.email.split('@')[0];
  const displayAvatar = member.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${member.email}`;
  const displayRole = member.jobTitle || member.role;

  const latestEntry = telemetry[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background min-h-0 font-sans border-l border-border">
      <ScrollArea className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        
        <div className="p-10 max-w-5xl mx-auto space-y-12 relative z-10">
          {/* Profile Header */}
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="relative group">
              <Avatar className="h-32 w-32 border-4 border-background ring-2 ring-border shadow-2xl relative transition-transform group-hover:scale-105">
                <AvatarImage src={displayAvatar} />
                <AvatarFallback className="text-3xl text-muted-foreground">{displayName[0]}</AvatarFallback>
              </Avatar>
              {member.isLive && (
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
                  <h1 className="text-4xl font-bold tracking-tight text-foreground uppercase">{displayName}</h1>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-widest bg-muted/30 border-border/50 font-mono py-0.5">
                    UID::{member.id.substring(0, 8)}
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
                         onKeyDown={(e) => e.key === 'Enter' && handleUpdateRole()}
                       />
                       <div className="flex items-center gap-1 border-l border-border pl-1">
                         <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500 hover:bg-green-500/10" onClick={handleUpdateRole} disabled={isUpdating}>
                           {isUpdating ? <Loader2 className="h-3 w-3 animate-spin"/> : <Check className="h-4 w-4" />}
                         </Button>
                         <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => setIsEditingRole(false)}>
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
                  <span className="text-xs font-semibold uppercase">{member.department || 'GENERAL_OPS'}</span>
                </div>
                <Separator orientation="vertical" className="h-10 hidden md:block" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                    <Activity className="h-3 w-3" /> Last Sync
                  </span>
                  <span className="text-xs font-mono text-blue-400">
                    {latestEntry ? timeSince(latestEntry.timestamp) : '–'}
                  </span>
                </div>
                <Separator orientation="vertical" className="h-10 hidden md:block" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                    <BadgeInfo className="h-3 w-3" /> Telemetry Entries
                  </span>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase border-green-500/30 text-green-500 bg-green-500/5">
                    {telemetry.length} record{telemetry.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Telemetry Section */}
          <div className="space-y-8">
            <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2 border-b border-border pb-3">
              <Signal className="h-3.5 w-3.5" /> Live_Telemetry_Buffer
              {telemetryLoading && <Loader2 className="h-3 w-3 animate-spin ml-auto text-primary" />}
            </h3>

            {telemetry.length === 0 && !telemetryLoading && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
                <div className="p-4 rounded-2xl bg-muted/10 border border-border">
                  <Signal className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">No telemetry data for this operator yet.</p>
                <p className="text-[11px] text-muted-foreground/60 max-w-sm">
                  Telemetry will appear here once this member pushes code context to the Sentinel cloud.
                </p>
              </div>
            )}

            {telemetry.map((entry, idx) => {
              const snippets = parseSnippets(entry.code_snippets);
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-xl border border-border bg-muted/5 overflow-hidden"
                >
                  {/* Entry Header */}
                  <div className="flex items-center gap-3 px-5 py-3 bg-muted/10 border-b border-border/50">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-[11px] font-mono font-bold text-primary truncate">{entry.branch}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground shrink-0">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(entry.timestamp)}
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono border-border/50 py-0">
                        #{entry.id}
                      </Badge>
                    </div>
                  </div>

                  {/* Code Snippets */}
                  <div className="p-5 space-y-3">
                    {snippets.length > 0 ? (
                      snippets.map((snippet, sIdx) => (
                        <div key={sIdx} className="rounded-lg bg-background border border-border/60 overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border/40">
                            <Code2 className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                              Snippet {sIdx + 1}
                            </span>
                          </div>
                          <pre className="p-3 text-[11px] font-mono text-foreground/85 whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
                            {snippet}
                          </pre>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No code snippets in this telemetry entry.</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
