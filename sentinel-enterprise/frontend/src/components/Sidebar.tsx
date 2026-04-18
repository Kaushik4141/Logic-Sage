import {
  Users,
  LayoutGrid,
  PanelLeft,
  ChevronLeft,
  Terminal,
  Library
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TeamMember {
  id: string;
  email: string;
  jobTitle?: string | null;
  role: string;
  // Dynamic fields
  name?: string;
  avatar?: string;
  isLive?: boolean;
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  teamMembers: TeamMember[];
}

export const Sidebar = ({ isCollapsed, onToggle, activeTab, onTabChange, teamMembers }: SidebarProps) => {
  return (
    <div className={cn(
      "flex flex-col h-full min-h-0 transition-all duration-300 ease-in-out border-r border-border bg-background",
      isCollapsed ? "w-[65px]" : "w-[260px]"
    )}>
      {isCollapsed ? (
        <TooltipProvider delayDuration={0}>
          <div className="flex flex-col h-full bg-[#080808] border-r border-border/50 overflow-hidden shadow-2xl shadow-black/50">
            {/* Logo Section */}
            <div className="p-4 flex flex-col items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="cursor-pointer hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center"
                    onClick={onToggle}
                  >
                    <img src="/logo 1.png" alt="Sentinel Logo" className="w-10 h-10 object-contain" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>Expand Sidebar</TooltipContent>
              </Tooltip>
            </div>

            {/* Content Section - Scrollable */}
            <div className="flex-1 overflow-x-hidden overflow-y-auto no-scrollbar py-4 flex flex-col items-center gap-6">
              {/* Teams Section */}
              <div className="flex flex-col gap-3">
                {teamMembers.map((member) => (
                  <Tooltip key={member.id}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "relative cursor-pointer transition-all duration-300 hover:ring-2 hover:ring-primary/40 rounded-full",
                          activeTab === `member-${member.id}` ? "ring-2 ring-primary bg-primary/10" : "p-0.5"
                        )}
                        onClick={() => onTabChange(`member-${member.id}`)}
                      >
                        <img
                          src={member.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${member.email}`}
                          className="h-9 w-9 rounded-full border border-zinc-800/50 bg-black object-cover shadow-sm grayscale hover:grayscale-0 transition-all duration-500"
                          referrerPolicy="no-referrer"
                          alt={member.name || member.email}
                        />
                        {member.isLive && (
                          <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-blue-500 border-2 border-[#080808] shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={12} className="bg-[#0c0c0c]/95 border border-zinc-800/50 backdrop-blur-xl px-4 py-3 shadow-2xl">
                      <div className="flex flex-col gap-1.5 min-w-[120px]">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-xs text-white tracking-wide">
                            {member.name || member.email.split('@')[0]}
                          </p>
                          {member.isLive && (
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                          )}
                        </div>
                        <div className="h-px w-full bg-zinc-800/30" />
                        <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-tighter opacity-80">
                          {member.jobTitle || member.role || "Operator"}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              <div className="w-8 h-px bg-zinc-800/50 mx-auto" />

              {/* Navigation Section */}
              <nav className="flex flex-col gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onTabChange("summary")}
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm",
                        activeTab === "summary"
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                          : "bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800 hover:text-white border border-transparent hover:border-zinc-700/50"
                      )}
                    >
                      <LayoutGrid className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>Overview</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onTabChange("chat")}
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm",
                        activeTab === "chat"
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                          : "bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800 hover:text-white border border-transparent hover:border-zinc-700/50"
                      )}
                    >
                      <Terminal className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>Team CLI</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onTabChange("documentation")}
                      className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm",
                        activeTab === "documentation"
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105"
                          : "bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800 hover:text-white border border-transparent hover:border-zinc-700/50"
                      )}
                    >
                      <Library className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>Documentation</TooltipContent>
                </Tooltip>
              </nav>
            </div>

            {/* Footer Section */}
            <div className="p-4 flex flex-col items-center border-t border-zinc-800/30">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggle}
                    className="h-10 w-10 rounded-xl bg-zinc-900/50 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 hover:text-white transition-all border border-transparent hover:border-zinc-700/50"
                  >
                    <PanelLeft className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>Expand</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      ) : (
        <div className="p-4 flex flex-col h-full min-h-0 bg-[#080808]">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div className="flex items-center gap-3">
              <div 
                className="cursor-pointer hover:scale-110 active:scale-95 transition-all duration-300"
                onClick={onToggle}
              >
                <img src="/logo 1.png" alt="Sentinel Logo" className="h-9 w-auto object-contain" />
              </div>
              <span className="text-sm font-bold tracking-[0.2em] text-foreground font-orbitron uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500">Sentinel</span>
            </div>
            <button
              onClick={onToggle}
              className="text-muted-foreground hover:text-white transition-all p-1.5 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mb-4 shrink-0">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              Live Context
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar scrollbar-hide -mx-2 px-2 space-y-6">
            <div className="space-y-1">
              {teamMembers.map((member) => (
                <motion.div
                  key={member.id}
                  onClick={() => onTabChange(`member-${member.id}`)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "group relative flex items-start gap-3 rounded-xl p-2.5 hover:bg-muted/50 transition-all cursor-pointer border border-transparent hover:border-border/50",
                    activeTab === `member-${member.id}` && "bg-muted border-border"
                  )}
                >
                  <div className="relative shrink-0">
                    <img
                      src={member.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${member.email}`}
                      className="h-9 w-9 rounded-full border border-border/50 object-cover"
                      referrerPolicy="no-referrer"
                      alt={member.name || member.email}
                    />
                    {member.isLive && (
                      <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 border-2 border-background" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-semibold truncate text-foreground">{member.name || member.email.split('@')[0]}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] text-muted-foreground truncate font-sans opacity-70">
                        {member.jobTitle || member.role}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="h-px bg-border/50 mx-2" />

            <div className="space-y-6 px-2">
              <div className="space-y-2">
                <h3 className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground/50 mb-3 ml-1">Terminal</h3>
                <nav className="space-y-1">
                  <button
                    onClick={() => onTabChange("summary")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-all group",
                      activeTab === "summary" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" />
                    <span className="font-semibold">Overview</span>
                  </button>
                  <button
                    onClick={() => onTabChange("chat")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-all group",
                      activeTab === "chat" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Terminal className="h-4 w-4 shrink-0" />
                    <span className="font-semibold">Team CLI</span>
                  </button>
                  <button
                    onClick={() => onTabChange("documentation")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-all group",
                      activeTab === "documentation" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Library className="h-4 w-4 shrink-0" />
                    <span className="font-semibold">Documentation</span>
                  </button>

                </nav>
              </div>


            </div>
          </div>


        </div>
      )}
    </div>
  );
};
