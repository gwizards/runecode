import React, { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Search,
  X,
  GitBranch,
  ListChecks,
  Download,
  LayoutGrid,
  LayoutList,
  BarChart3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { AnimatePresence } from "motion/react";
import type { TodoItem, ToolResult } from "./types";
import { TodoCard } from "./todo/TodoCard";
import { TodoStatsView } from "./todo/TodoStatsView";
import { TodoBoardView } from "./todo/TodoBoardView";
import { TodoTimelineView } from "./todo/TodoTimelineView";
import type { TodoStatusConfig } from "./todo/types";

/**
 * Widget for TodoRead tool - displays todos with advanced viewing capabilities
 */
export const TodoReadWidget: React.FC<{ todos?: TodoItem[]; result?: ToolResult }> = ({ todos: inputTodos, result }) => {
  let todos: TodoItem[] = inputTodos || [];
  if (!todos.length && result) {
    if (typeof result === 'object' && Array.isArray(result.todos)) {
      todos = result.todos;
    } else if (typeof result.content === 'string') {
      try {
        const parsed = JSON.parse(result.content);
        if (Array.isArray(parsed)) todos = parsed;
        else if (parsed.todos) todos = parsed.todos;
      } catch (e) {
        // Not JSON, ignore
      }
    }
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "board" | "timeline" | "stats">("list");
  const [expandedTodos, setExpandedTodos] = useState<Set<string>>(new Set());

  const statusConfig: Record<string, TodoStatusConfig> = {
    completed: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
      label: "Completed"
    },
    in_progress: {
      icon: <Clock className="h-4 w-4 animate-pulse" />,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      label: "In Progress"
    },
    pending: {
      icon: <Circle className="h-4 w-4" />,
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
      borderColor: "border-muted",
      label: "Pending"
    },
    cancelled: {
      icon: <X className="h-4 w-4" />,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/20",
      label: "Cancelled"
    }
  };

  const filteredTodos = todos.filter(todo => {
    const matchesSearch = !searchQuery ||
      todo.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (todo.id && todo.id.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || todo.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: todos.length,
    completed: todos.filter(t => t.status === "completed").length,
    inProgress: todos.filter(t => t.status === "in_progress").length,
    pending: todos.filter(t => t.status === "pending").length,
    cancelled: todos.filter(t => t.status === "cancelled").length,
    completionRate: todos.length > 0
      ? Math.round((todos.filter(t => t.status === "completed").length / todos.length) * 100)
      : 0
  };

  const todosByStatus = {
    pending: filteredTodos.filter(t => t.status === "pending"),
    in_progress: filteredTodos.filter(t => t.status === "in_progress"),
    completed: filteredTodos.filter(t => t.status === "completed"),
    cancelled: filteredTodos.filter(t => t.status === "cancelled")
  };

  const toggleExpanded = (todoId: string) => {
    setExpandedTodos(prev => {
      const next = new Set(prev);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  };

  const exportAsJson = () => {
    const dataStr = JSON.stringify(todos, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'todos.json');
    linkElement.click();
  };

  const exportAsMarkdown = () => {
    let markdown = "# Todo List\n\n";
    markdown += `**Total**: ${stats.total} | **Completed**: ${stats.completed} | **In Progress**: ${stats.inProgress} | **Pending**: ${stats.pending}\n\n`;
    const statusGroups = ["pending", "in_progress", "completed", "cancelled"];
    statusGroups.forEach(status => {
      const todosInStatus = todos.filter(t => t.status === status);
      if (todosInStatus.length > 0) {
        markdown += `## ${statusConfig[status as keyof typeof statusConfig]?.label || status}\n\n`;
        todosInStatus.forEach(todo => {
          const checkbox = todo.status === "completed" ? "[x]" : "[ ]";
          markdown += `- ${checkbox} ${todo.content}${todo.id ? ` (${todo.id})` : ""}\n`;
          if ((todo.dependencies?.length ?? 0) > 0) {
            markdown += `  - Dependencies: ${todo.dependencies!.join(", ")}\n`;
          }
        });
        markdown += "\n";
      }
    });
    const dataUri = 'data:text/markdown;charset=utf-8,'+ encodeURIComponent(markdown);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'todos.md');
    linkElement.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListChecks className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-medium">Todo Overview</h3>
            <p className="text-xs text-muted-foreground">
              {stats.total} total &bull; {stats.completed} completed &bull; {stats.completionRate}% done
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportAsJson}>
            <Download className="h-3 w-3 mr-1" />
            JSON
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportAsMarkdown}>
            <Download className="h-3 w-3 mr-1" />
            Markdown
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search todos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex gap-1 p-1 bg-muted rounded-md">
            {["all", "pending", "in_progress", "completed", "cancelled"].map(status => (
              <Button
                key={status}
                size="sm"
                variant={statusFilter === status ? "default" : "ghost"}
                className="h-7 px-2 text-xs"
                onClick={() => setStatusFilter(status)}
              >
                {status === "all" ? "All" : statusConfig[status as keyof typeof statusConfig]?.label}
                {status === "all" && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                    {stats.total}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="list" className="text-xs">
            <LayoutList className="h-4 w-4 mr-1" />
            List
          </TabsTrigger>
          <TabsTrigger value="board" className="text-xs">
            <LayoutGrid className="h-4 w-4 mr-1" />
            Board
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">
            <GitBranch className="h-4 w-4 mr-1" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="stats" className="text-xs">
            <BarChart3 className="h-4 w-4 mr-1" />
            Stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredTodos.map(todo => (
                <TodoCard
                  key={todo.id || filteredTodos.indexOf(todo)}
                  todo={todo}
                  isExpanded={expandedTodos.has(todo.id)}
                  statusConfig={statusConfig}
                  onToggleExpand={toggleExpanded}
                />
              ))}
            </AnimatePresence>
            {filteredTodos.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {searchQuery || statusFilter !== "all"
                  ? "No todos match your filters"
                  : "No todos available"}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="board" className="mt-4">
          <TodoBoardView
            todosByStatus={todosByStatus}
            statusConfig={statusConfig}
            expandedTodos={expandedTodos}
            onToggleExpand={toggleExpanded}
          />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TodoTimelineView
            todos={todos}
            statusConfig={statusConfig}
            expandedTodos={expandedTodos}
            onToggleExpand={toggleExpanded}
          />
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <TodoStatsView stats={stats} statusConfig={statusConfig} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
