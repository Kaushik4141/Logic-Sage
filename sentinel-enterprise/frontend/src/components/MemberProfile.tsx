import { 
  Signal, 
  Edit2,
  Check,
  X,
  Loader2,
  Terminal,
  BadgeInfo,
  Activity
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "motion/react";
import { useState } from "react";
import { Button } from "./ui/button";

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

export function MemberProfile({ member, isLead, onRoleUpdate }: MemberProfileProps) {
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [newRole, setNewRole] = useState(member?.jobTitle || member?.role || "");
  const [isUpdating, setIsUpdating] = useState(false);

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
                  <h1 className="text-4xl font-bold tracking-tight text-foreground uppercase tracking-wider">{displayName}</h1>
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
                    <Activity className="h-3 w-3" /> System Uptime
                  </span>
                  <span className="text-xs font-mono text-blue-400">{member.uptime || '04:12:33'}</span>
                </div>
                <Separator orientation="vertical" className="h-10 hidden md:block" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
                    <BadgeInfo className="h-3 w-3" /> Security Clearance
                  </span>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase border-green-500/30 text-green-500 bg-green-500/5">Level_04</Badge>
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Detailed Activity Docs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-4">
             <section className="space-y-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2 border-b border-border pb-3">
                  <Signal className="h-3.5 w-3.5" /> Live_Telemetry_Buffer
                </h3>
                <div className="space-y-6 text-sm text-muted-foreground font-sans leading-relaxed">
                  <div className="p-4 rounded-xl bg-muted/10 border border-border space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono uppercase tracking-widest">Active_Path</span>
                      <span className="text-[10px] font-mono text-primary uppercase">{member.branch || 'MAIN'}</span>
                    </div>
                    <code className="block text-xs text-foreground bg-background p-2 rounded border border-border font-mono truncate">
                      {member.file || 'sentinel/core/identity.ts'}
                    </code>
                  </div>
                  <p className="opacity-80">
                    Operator heartbeat detected in the <span className="text-foreground font-semibold">{member.department || 'CORE'}</span> cluster. Telemetry indicates constant stream activity with zero packet loss in current session cycles.
                  </p>
                </div>
             </section>

             <section className="space-y-6">
               <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2 border-b border-border pb-3">
                 <Terminal className="h-3.5 w-3.5" /> Assignment_Stack
               </h3>
               <div className="space-y-3">
                 {(member.tasks || ["Initialize RBAC Handshake", "Audit D1 Migration", "Sync Telemetry Buffers"]).map((task, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-4 rounded-xl bg-muted/5 border border-border/40 hover:border-primary/20 transition-colors group">
                       <div className="h-6 w-6 rounded bg-background border border-border flex items-center justify-center text-[10px] font-mono group-hover:border-primary/30 group-hover:text-primary transition-colors">
                         {idx + 1}
                       </div>
                       <p className="text-[13px] text-muted-foreground group-hover:text-foreground transition-colors py-0.5">
                         {task}
                       </p>
                    </div>
                 ))}
               </div>
             </section>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
