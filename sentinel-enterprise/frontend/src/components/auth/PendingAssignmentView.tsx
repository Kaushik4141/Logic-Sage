import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Radar, Loader2, CheckCircle2, ShieldAlert, LogOut } from "lucide-react";
import { Button } from "../ui/button";

type Invite = { id: string; senderEmail: string };

type PendingAssignmentViewProps = {
  email: string;
  onLogout: () => void;
  onInviteAccepted: (teamId: string) => void;
};

export function PendingAssignmentView({ email, onLogout, onInviteAccepted }: PendingAssignmentViewProps) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for invites
  useEffect(() => {
    let mounted = true;
    const fetchInvites = async () => {
      try {
        const res = await fetch(`https://edge-api.kaushik0h0s.workers.dev/api/invites/${encodeURIComponent(email)}`);
        if (!res.ok) throw new Error("Failed to fetch invites");
        const json = await res.json();
        if (mounted && json.status === "success") {
          setInvites(json.data);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchInvites();
    const interval = setInterval(fetchInvites, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [email]);

  const handleAccept = async (inviteId: string) => {
    setIsAccepting(true);
    setError(null);
    try {
      const invite = invites.find(i => i.id === inviteId);
      if (!invite) throw new Error("Invite not found");

      const res = await fetch('https://edge-api.kaushik0h0s.workers.dev/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId, userEmail: email })
      });
      const data = await res.json();
      if (data.status !== "success") throw new Error(data.message);
      
      onInviteAccepted(invite.senderEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsAccepting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden dark text-foreground">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-30 pointer-events-none">
        <div className="w-[800px] h-[800px] bg-red-900/10 border border-red-500/10 rounded-full animate-ping duration-[5000ms] absolute" />
        <div className="w-[600px] h-[600px] bg-red-900/10 border border-red-500/10 rounded-full animate-ping duration-[4000ms] delay-1000 absolute" />
        <div className="w-[400px] h-[400px] bg-red-900/20 shadow-[0_0_100px_rgba(220,38,38,0.2)] rounded-full absolute" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="z-10 w-full max-w-lg space-y-8"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="h-20 w-20 bg-background border-2 border-dashed border-red-500/50 rounded-full flex items-center justify-center text-red-500 shadow-[0_0_30px_rgba(220,38,38,0.3)]">
            <ShieldAlert className="h-8 w-8 animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold uppercase tracking-widest text-foreground">Restricted Access</h1>
          <p className="text-muted-foreground max-w-sm text-sm font-sans leading-relaxed">
            Your identity Node <span className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">{email}</span> is not assigned to an active engineering team. Features are locked until a Team Lead dispatches an authorization signal.
          </p>
        </div>

        <div className="bg-muted/10 border border-border rounded-2xl p-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary animate-spin-slow" />
              Intercepted Signals
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground/60">POLLING CLOUD_DB</span>
          </div>

          {invites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4 text-muted-foreground opacity-50">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-xs font-mono uppercase tracking-widest">Awaiting Transmission...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invites.map(invite => (
                <div key={invite.id} className="bg-background border border-primary/30 p-4 rounded-xl flex items-center justify-between group hover:border-primary transition-colors">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-widest">Incoming Invite</p>
                    <p className="text-sm font-medium font-mono">{invite.senderEmail}</p>
                  </div>
                  <Button 
                    onClick={() => handleAccept(invite.id)}
                    disabled={isAccepting}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase text-[10px] tracking-widest"
                  >
                    {isAccepting ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept</>}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-4 text-[10px] font-mono text-destructive uppercase text-center">{error}</p>
          )}
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" className="text-muted-foreground text-xs uppercase tracking-widest" onClick={onLogout}>
            <LogOut className="h-3 w-3 mr-2" /> Disconnect Session
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
