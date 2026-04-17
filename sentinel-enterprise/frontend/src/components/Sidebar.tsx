
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bug } from "lucide-react";

const MOCK_TEAM_CONTEXT = [
  { id: 1, name: "David (Backend)", status: "Editing", file: "src/api/auth.ts", time: "Just now", isLive: true },
  { id: 2, name: "Sarah (Frontend)", status: "Viewing", file: "components/Button.tsx", time: "2 min ago", isLive: false },
  { id: 3, name: "Alex (DevOps)", status: "Idle", file: "docker-compose.yml", time: "1 hr ago", isLive: false }
];

export function Sidebar() {
  const handleDebugTrigger = () => {
    toast("🔔 Jira Ticket Detected: ENG-402", {
      description: "Sentinel found a Developer Blueprint from Sarah regarding the Auth Refactor.",
      action: {
        label: "View Context",
        onClick: () => console.log("Viewing Jira Context ENG-402"),
      },
    });
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  }

  return (
    <div className="flex flex-col h-full bg-black text-white border-r border-zinc-800">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-400 uppercase">
          Live Team Context
        </h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {MOCK_TEAM_CONTEXT.map((user) => (
            <div key={user.id} className="flex items-start gap-3 group">
              <Avatar className="h-8 w-8 border border-zinc-700">
                <AvatarFallback className="bg-zinc-900 text-zinc-400 text-xs">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {user.name}
                  </span>
                  {user.isLive && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                  )}
                </div>
                
                <div className="text-xs text-zinc-500 mt-0.5 truncate">
                  <span className="text-zinc-400">{user.status}:</span> {user.file}
                </div>
                
                <div className="text-[10px] text-zinc-600 mt-1">
                  {user.time}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 mt-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-700 hover:text-zinc-500 hover:bg-zinc-900"
          onClick={handleDebugTrigger}
          id="debug-trigger"
        >
          <Bug className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
