import { useState } from "react";
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
  MessageSquare,
  Settings,
  Search,
  Circle,
  Code2,
  Terminal,
  Activity,
  Send,
  MoreVertical,
  Paperclip,
  Smile,
  Command
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

const MOCK_TEAM_CONTEXT = [
  { id: 1, name: "David (Backend)", status: "Editing", file: "src/api/auth.ts", time: "Just now", isLive: true, avatar: "https://github.com/shadcn.png" },
  { id: 2, name: "Sarah (Frontend)", status: "Viewing", file: "components/Button.tsx", time: "2 min ago", isLive: false, avatar: "https://github.com/leerob.png" },
  { id: 3, name: "Alex (DevOps)", status: "Idle", file: "docker-compose.yml", time: "1 hr ago", isLive: false, avatar: "https://github.com/evilrabbit.png" }
];

const MOCK_MESSAGES = [
  { id: 1, sender: "David (Backend)", content: "Hey Sarah, I just finished the auth endpoint. Can you check if the frontend is receiving the 201 status code correctly?", time: "10:24 AM" },
  { id: 2, sender: "Sarah (Frontend)", content: "On it! I'm currently looking at Button.tsx to see if we need a global transition for the loading state.", time: "10:25 AM" },
  { id: 3, sender: "Sentinel AI", content: "I've detected a potential race condition in `src/api/auth.ts` related to the session storage. Would you like me to analyze the trace?", time: "10:26 AM", isAI: true },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("chat");
  const [message, setMessage] = useState("");

  return (
    <TooltipProvider delay={0}>
      <div className="dark h-screen w-full bg-background text-foreground font-sans overflow-hidden flex flex-col">
        {/* Top Navbar mimic shadcn sticky header */}
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-12 items-center px-4">
            <div className="flex items-center space-x-2">
              <Code2 className="h-5 w-5 text-primary" />
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
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Activity className="h-4 w-4" />
                  </button>
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
            <ResizablePanel defaultSize={20} minSize={15} className="border-r border-border bg-background flex flex-col">
              <div className="p-4 flex flex-col h-full">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Live Context
                  </h2>
                  <div className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                </div>

                <ScrollArea className="flex-1 -mx-2 px-2">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      {MOCK_TEAM_CONTEXT.map((member) => (
                        <motion.div
                          key={member.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cn(
                            "group relative flex items-start gap-3 rounded-md p-2 hover:bg-muted transition-all cursor-pointer",
                            member.isLive && "bg-muted/30"
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

                    <div className="space-y-4">
                      <div className="px-2">
                        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Navigation</h3>
                        <nav className="space-y-1">
                          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md bg-accent text-accent-foreground">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Team Chat
                          </button>
                          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <Terminal className="h-3.5 w-3.5" />
                            CLI Logs
                          </button>
                          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <Settings className="h-3.5 w-3.5" />
                            Settings
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
            <ResizablePanel defaultSize={80} className="bg-background flex flex-col">
              <div className="flex-1 flex flex-col relative overflow-hidden">
                {/* Chat Header */}
                <header className="flex h-12 items-center justify-between px-6 border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-0 z-10 font-sans">
                  <div className="flex items-center gap-2">
                    <div className="p-1 px-2 rounded border border-border bg-muted/30">
                      <span className="text-[10px] font-mono font-bold tracking-tight">CHAT_ROOM_A</span>
                    </div>
                    <Separator orientation="vertical" className="h-4 mx-2" />
                    <div className="flex -space-x-2">
                      {MOCK_TEAM_CONTEXT.map(m => (
                        <Avatar key={m.id} className="h-5 w-5 border border-background">
                          <AvatarImage src={m.avatar} />
                        </Avatar>
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground ml-2">3 researchers online</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button className="text-muted-foreground hover:text-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </header>

                {/* Chat Feed */}
                <ScrollArea className="flex-1 p-6">
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

                {/* Input Area */}
                <div className="p-4 border-t border-border/50 bg-background/50 backdrop-blur-md">
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
                          onChange={(e) => setMessage(e.target.value)}
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
