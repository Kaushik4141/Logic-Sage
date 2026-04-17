import { 
  Signal, 
  MoreVertical, 
  FileCode, 
  Terminal 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface MemberProfileProps {
  member: {
    id: number;
    name: string;
    role: string;
    department: string;
    status: string;
    file: string;
    time: string;
    isLive: boolean;
    avatar: string;
    branch: string;
    uptime: string;
    tasks: string[];
  };
}

export function MemberProfile({ member }: MemberProfileProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background min-h-0 font-sans">
      <ScrollArea className="flex-1 min-h-0 relative">
        {/* Background Grid Accent */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        
        <div className="p-10 max-w-5xl mx-auto space-y-12 relative z-10">
          {/* Header Profile */}
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="relative group">
              <Avatar className="h-28 w-28 border-4 border-background ring-2 ring-border shadow-2xl">
                <AvatarImage src={member.avatar} />
                <AvatarFallback className="text-2xl">{member.name[0]}</AvatarFallback>
              </Avatar>
              {member.isLive && (
                <motion.div 
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -bottom-2 -right-2 bg-blue-500 text-[9px] font-bold text-white px-2 py-0.5 rounded-full border-2 border-background animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                >
                  LIVE
                </motion.div>
              )}
            </div>

            <div className="space-y-4 flex-1">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">{member.name}</h1>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-widest bg-muted/50 font-mono">
                    UID: 00{member.id}-SNTL
                  </Badge>
                </div>
                <p className="text-lg text-muted-foreground font-medium font-sans italic opacity-80">{member.role}</p>
              </div>

              <div className="flex flex-wrap gap-6 pt-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Department</span>
                  <span className="text-sm font-medium">{member.department}</span>
                </div>
                <Separator orientation="vertical" className="h-8 hidden md:block" />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Session Uptime</span>
                  <span className="text-sm font-mono text-primary">{member.uptime}</span>
                </div>
                <Separator orientation="vertical" className="h-8 hidden md:block" />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Signal Strength</span>
                  <div className="flex items-center gap-1.5 h-5">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={cn("h-2.5 w-1 rounded-full", i <= 4 ? "bg-green-500" : "bg-muted")} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex md:flex-col gap-3">
              <button className="px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2">
                <Signal className="h-3.5 w-3.5 text-muted-foreground" />
                Ping
              </button>
              <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-primary/10 flex items-center gap-2">
                <MoreVertical className="h-3.5 w-3.5" />
                Actions
              </button>
            </div>
          </div>

          {/* Documentation Overview Grid */}
          <div className="space-y-12">
            {/* Operator specification documents */}
            <div className="space-y-6">
              <section className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground border-b border-border pb-2">01_Operator_Biography</h3>
                <div className="text-[14px] text-muted-foreground leading-relaxed font-sans max-w-3xl space-y-4">
                  <p>
                    Operator <span className="text-foreground font-mono font-bold">{member.name}</span> currently serves as a lead in the <span className="text-foreground">{member.department}</span> department, holding the rank of <span className="text-primary italic">{member.role}</span>. 
                  </p>
                  <p>
                    Primary responsibilities involve the maintenance and expansion of core system anchors. Current mission parameters focus on <span className="font-mono text-foreground/80">{member.file}</span> within the <span className="font-mono text-foreground/80">{member.branch}</span> branch.
                  </p>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-4">
                {/* Assignments */}
                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground border-b border-border pb-2">02_Current_Assignments</h3>
                  <div className="space-y-3">
                    {member.tasks.map((task, idx) => (
                      <div key={idx} className="flex items-start gap-4 p-4 rounded-lg bg-muted/5 border border-border/50">
                        <Badge variant="outline" className="text-[8px] font-mono h-5 shrink-0 bg-background">ASN-0{idx}</Badge>
                        <span className="text-[13px] text-muted-foreground leading-snug">{task}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Session Logs */}
                <section className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground border-b border-border pb-2">03_Handshake_Logs</h3>
                  <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-3 before:w-px before:bg-border/50">
                    {[
                      { time: "10:42", msg: "Initial protocol handshake", status: "success" },
                      { time: "11:15", msg: "Synced mainline/core-sync", status: "success" },
                      { time: "14:20", msg: "Security Tier elevation", status: "warning" },
                      { time: "15:00", msg: "Anchor state propagated", status: "success" }
                    ].map((log, i) => (
                      <div key={i} className="flex gap-4 relative">
                        <div className={cn(
                          "h-1.5 w-1.5 rounded-full mt-1.5 z-10 ring-4 ring-background",
                          log.status === "success" ? "bg-primary" : "bg-orange-400"
                        )} />
                        <div className="space-y-1">
                          <p className="text-[10px] font-mono text-muted-foreground leading-none">{log.time}</p>
                          <p className="text-[12px] text-foreground/80 font-sans">{log.msg}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
