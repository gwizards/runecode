import type { ReactNode } from "react";

export type { TodoItem } from "../types";

export interface TodoStatusConfig {
  icon: ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}

export interface TodoStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
  completionRate: number;
}
