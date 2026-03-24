import React from "react";
import { cn } from "@/lib/utils";
import { TodoCard } from "./TodoCard";
import type { TodoStatusConfig, TodoItem } from "./types";

interface TodoTimelineViewProps {
  todos: TodoItem[];
  statusConfig: Record<string, TodoStatusConfig>;
  expandedTodos: Set<string>;
  onToggleExpand: (todoId: string) => void;
}

export const TodoTimelineView: React.FC<TodoTimelineViewProps> = ({
  todos, statusConfig, expandedTodos, onToggleExpand,
}) => {
  const rootTodos = todos.filter(t => !t.dependencies || t.dependencies.length === 0);
  const rendered = new Set<string>();

  const renderTodoWithDependents = (todo: TodoItem, level = 0) => {
    if (rendered.has(todo.id)) return null;
    rendered.add(todo.id);

    const dependents = todos.filter(t =>
      t.dependencies?.includes(todo.id) && !rendered.has(t.id)
    );

    return (
      <div key={todo.id} className="relative">
        {level > 0 && (
          <div className="absolute left-6 top-0 w-px h-6 bg-border" />
        )}
        <div className={cn("flex gap-4", level > 0 && "ml-12")}>
          <div className="relative">
            <div className={cn(
              "w-3 h-3 rounded-full border-2 bg-background",
              statusConfig[todo.status as keyof typeof statusConfig]?.borderColor
            )} />
            {dependents.length > 0 && (
              <div className="absolute left-1/2 top-3 w-px h-full bg-border -translate-x-1/2" />
            )}
          </div>
          <div className="flex-1 pb-6">
            <TodoCard
              todo={todo}
              isExpanded={expandedTodos.has(todo.id)}
              statusConfig={statusConfig}
              onToggleExpand={onToggleExpand}
            />
          </div>
        </div>
        {dependents.map(dep => renderTodoWithDependents(dep, level + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {rootTodos.map(todo => renderTodoWithDependents(todo))}
      {todos.filter(t => !rendered.has(t.id)).map(todo => renderTodoWithDependents(todo))}
    </div>
  );
};
