import {
  Users,
  LayoutGrid,
  PanelLeft,
  ChevronLeft
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
          <div className="flex flex-col items-center py-6 px-2 h-full gap-6 bg-[#0c0c0c] overflow-y-auto no-scrollbar scrollbar-hide">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="w-full px-1.5 shrink-0 cursor-pointer hover:scale-105 transition-transform flex items-center justify-center"
                  onClick={onToggle}
                >
                  <img src="/logo 1.png" alt="Sentinel Logo" className="w-full h-10 object-contain" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Expand Sidebar</TooltipContent>
            </Tooltip>

            <div className="flex flex-col gap-4 items-center">
              {teamMembers.map((member) => (
                <Tooltip key={member.id}>
                  <TooltipTrigger asChild>
                    <div
                      className="relative cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => onTabChange(`member-${member.id}`)}
                    >
                      <img
                        src={member.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${member.email}`}
                        className="h-10 w-10 rounded-full border border-zinc-800 bg-black object-cover"
                        referrerPolicy="no-referrer"
                        alt={member.name || member.email}
                      />
                      {member.isLive && (
                        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-[#0c0c0c]" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="space-y-1">
                      <p className="font-bold text-xs">{member.name || member.email.split('@')[0]}</p>
                      <p className="text-[10px] text-muted-foreground">{member.jobTitle || member.role}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            <div className="mt-auto pt-4 flex flex-col gap-5 items-center w-full pb-4">
              

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggle}
                    className="h-10 w-10 rounded-xl bg-[#1e1e1e] flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all shadow-sm"
                  >
                    <PanelLeft className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Toggle Sidebar</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      ) : (
        <div className="p-4 flex flex-col h-full min-h-0 bg-background">
          <div className="flex items-center justify-between mb-6 shrink-0 gap-4">
            <div className="flex-1 min-w-0 flex items-center">
              <img src="/logo.png" alt="Sentinel Logo" className="w-full h-10 object-contain object-left" />
            </div>
            <div className="flex items-center shrink-0">
              <button
                onClick={onToggle}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
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

                </nav>
              </div>


            </div>
          </div>


        </div>
      )}
    </div>
  );
};
