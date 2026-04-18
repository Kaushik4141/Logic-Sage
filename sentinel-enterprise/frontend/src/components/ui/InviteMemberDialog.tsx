import { useState } from "react";
import { UserPlus, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";
import { Button } from "./button";

type InviteMemberDialogProps = {
  senderEmail: string;
};

export function InviteMemberDialog({ senderEmail }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [receiverEmail, setReceiverEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiverEmail || !jobTitle) return;

    setIsSending(true);
    setStatus("idle");
    setMessage("");

    try {
      const res = await fetch('https://edge-api.kaushik0h0s.workers.dev/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderEmail, receiverEmail, jobTitle })
      });
      const data = await res.json();
      
      if (data.status === "success") {
        setStatus("success");
        setMessage(`Invitation dispatched to ${receiverEmail}`);
        setReceiverEmail("");
        setTimeout(() => setOpen(false), 2000);
      } else {
        throw new Error(data.message || "Failed to dispatch");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val: boolean) => { setOpen(val); if (!val) { setStatus("idle"); setMessage(""); setReceiverEmail(""); setJobTitle(""); }}}>
      <DialogTrigger 
        render={
          <Button variant="outline" size="sm" className="h-8 gap-2 border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase font-bold tracking-widest hidden sm:inline">Invite Personnel</span>
          </Button>
        } 
      />
      <DialogContent className="sm:max-w-md bg-background border-border dark text-foreground">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-widest font-bold">Dispatch Authorization</DialogTitle>
          <DialogDescription className="font-sans text-xs">
            Send a network invitation to authorize a new member into your engineering team.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleInvite} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Target Identity (Email)</label>
            <input
              type="email"
              value={receiverEmail}
              onChange={(e) => setReceiverEmail(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              placeholder="member@sentinel.network"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Assigned Role (Job Title)</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              placeholder="e.g. Backend Engineer, UI Designer"
              required
            />
          </div>

          {message && (
            <div className={`p-2 rounded text-xs text-center font-mono uppercase ${status === "success" ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}>
              {message}
            </div>
          )}

          <Button 
            type="submit" 
            disabled={isSending || !receiverEmail || !jobTitle}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase text-xs tracking-widest"
          >
            {isSending ? (
              <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Transmitting...</>
            ) : (
              <><Send className="h-3.5 w-3.5 mr-2" /> Dispatch Request</>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
