import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, User, Shield, ArrowRight, Loader2, KeyRound, UserPlus, LogIn } from "lucide-react";
import { cn } from "../../lib/utils";

type LoginViewProps = {
  onLogin: (email: string, password: string, role: "lead" | "member") => Promise<void>;
};

export function LoginView({ onLogin }: LoginViewProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<"lead" | "member">("member");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsAuthenticating(true);
    setError(null);
    try {
      // In login mode, we still pass the role but the backend ignores it for existing users
      await onLogin(email, password, mode === "signup" ? role : "member");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center relative overflow-hidden font-sans dark text-foreground selection:bg-primary/30">
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-40">
        <div className="w-[1200px] h-[500px] bg-primary/20 rounded-full blur-[150px] -rotate-45 translate-x-1/4 -translate-y-1/4 animate-pulse duration-[8000ms]" />
        <div className="w-[800px] h-[600px] bg-blue-900/20 rounded-full blur-[120px] absolute bottom-0 left-0 -translate-x-1/3 translate-y-1/3" />
      </div>

      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay z-0"></div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md z-10"
      >
        <div className="bg-card/40 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl p-8 relative overflow-hidden">
          {/* Edge Glow */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          {/* Header */}
          <div className="text-center mb-8 space-y-3">
            <div className="mx-auto h-16 w-16 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center relative shadow-[0_0_30px_-5px_rgba(var(--primary),0.3)]">
              <ShieldAlert className="h-8 w-8 text-primary absolute" />
            </div>
            <h1 className="text-3xl font-bold tracking-tighter uppercase text-foreground">Sentinel <span className="text-primary font-light">OS</span></h1>
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest px-4">
              {mode === "login" ? "Welcome back, operator" : "Initialize new identity"}
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/20 rounded-xl border border-border/40 mb-6">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); }}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                mode === "login"
                  ? "bg-background shadow-sm text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <LogIn className="h-3.5 w-3.5" />
              Login
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); }}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                mode === "signup"
                  ? "bg-background shadow-sm text-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role Selection — only visible in signup mode */}
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1 mb-1.5 block">Access Level</label>
                  <div className="grid grid-cols-2 gap-3 p-1.5 bg-muted/30 rounded-xl border border-border/50">
                    <button
                      type="button"
                      onClick={() => setRole("member")}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                        role === "member"
                          ? "bg-background shadow-sm text-foreground ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <User className="h-3.5 w-3.5" />
                      Member
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("lead")}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                        role === "lead"
                          ? "bg-primary/10 shadow-sm text-primary ring-1 ring-primary/30"
                          : "text-muted-foreground hover:text-primary/70 hover:bg-primary/5"
                      )}
                    >
                      <Shield className="h-3.5 w-3.5" />
                      Team Lead
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inputs */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Identity Node (Email)</label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-background/50 border border-border rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                    placeholder="Enter your email..."
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Cryptographic Key (Password)</label>
                <div className="relative group">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-background/50 border border-border rounded-xl py-3 pl-10 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-center"
                >
                  <p className="text-xs text-destructive font-mono uppercase">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isAuthenticating || !email || !password}
              className="w-full relative group overflow-hidden rounded-xl bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[11px] h-12 flex items-center justify-center transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="absolute inset-0 w-full h-full bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              {isAuthenticating ? (
                <span className="flex items-center gap-2 z-10"><Loader2 className="h-4 w-4 animate-spin" /> Authenticating...</span>
              ) : mode === "login" ? (
                <span className="flex items-center gap-2 z-10">Access System <ArrowRight className="h-3.5 w-3.5" /></span>
              ) : (
                <span className="flex items-center gap-2 z-10">Create Identity <UserPlus className="h-3.5 w-3.5" /></span>
              )}
            </button>
          </form>

          {/* Footer hint */}
          <div className="mt-6 text-center">
            <p className="text-[11px] text-muted-foreground/60 font-mono">
              {mode === "login" ? (
                <>Don't have an account? <button type="button" onClick={() => { setMode("signup"); setError(null); }} className="text-primary hover:underline uppercase tracking-wider font-bold">Sign up</button></>
              ) : (
                <>Already registered? <button type="button" onClick={() => { setMode("login"); setError(null); }} className="text-primary hover:underline uppercase tracking-wider font-bold">Login</button></>
              )}
            </p>
          </div>

          {/* Footer Decoration */}
          <div className="mt-5 flex justify-center gap-1.5 opacity-40">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-1 w-1 rounded-full bg-foreground" />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
