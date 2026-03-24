import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Hash, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TodoStatusConfig, TodoItem } from "./types";

interface TodoCardProps {
  todo: TodoItem;
  isExpanded: boolean;
  statusConfig: Record<string, TodoStatusConfig>;
  onToggleExpand: (todoId: string) => void;
}

export const TodoCard: React.FC<TodoCardProps> = ({ todo, isExpanded, statusConfig, onToggleExpand }) => {
  const config = statusConfig[todo.status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "group rounded-lg border p-4 transition-all hover:shadow-md cursor-pointer",
        config.bgColor,
        config.borderColor,
        todo.status === "completed" && "opacity-75"
      )}
      onClick={() => todo.id && onToggleExpand(todo.id)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5", config.color)}>
          {config.icon}
        </div>
        <div className="flex-1 space-y-2">
          <p className={cn(
            "text-sm",
            todo.status === "completed" && "line-through"
          )}>
            {todo.content}
          </p>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {todo.id && (
              <div className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                <span className="font-mono">{todo.id}</span>
              </div>
            )}
            {(todo.dependencies?.length ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                <span>{todo.dependencies!.length} deps</span>
              </div>
            )}
          </div>

          <AnimatePresence>
            {isExpanded && (todo.dependencies?.length ?? 0) > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2 mt-2 border-t space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Dependencies:</span>
                  <div className="flex flex-wrap gap-1">
                    {todo.dependencies!.map((dep: string) => (
                      <Badge
                        key={dep}
                        variant="outline"
                        className="text-xs font-mono"
                      >
                        {dep}
                      </Badge>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
