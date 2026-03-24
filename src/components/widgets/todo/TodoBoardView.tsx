import React from "react";
import { Badge } from "@/components/ui/badge";
import { TodoCard } from "./TodoCard";
import type { TodoStatusConfig, TodoItem } from "./types";

interface TodoBoardViewProps {
  todosByStatus: Record<string, TodoItem[]>;
  statusConfig: Record<string, TodoStatusConfig>;
  expandedTodos: Set<string>;
  onToggleExpand: (todoId: string) => void;
}

export const TodoBoardView: React.FC<TodoBoardViewProps> = ({
  todosByStatus, statusConfig, expandedTodos, onToggleExpand,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {Object.entries(todosByStatus).map(([status, todos]) => {
      const config = statusConfig[status as keyof typeof statusConfig];

      return (
        <div key={status} className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b">
            <div className={config.color}>{config.icon}</div>
            <h3 className="text-sm font-medium">{config.label}</h3>
            <Badge variant="secondary" className="ml-auto text-xs">
              {todos.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {todos.map(todo => (
              <TodoCard
                key={todo.id || todos.indexOf(todo)}
                todo={todo}
                isExpanded={expandedTodos.has(todo.id)}
                statusConfig={statusConfig}
                onToggleExpand={onToggleExpand}
              />
            ))}
            {todos.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No todos
              </p>
            )}
          </div>
        </div>
      );
    })}
  </div>
);
