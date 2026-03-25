/**
 * StorageDialogs — modal dialogs for the StorageTab database viewer.
 *
 * Exports:
 *  - EditRowDialog
 *  - NewRowDialog
 *  - DeleteRowDialog
 *  - ResetDatabaseDialog
 *  - SqlEditorDialog
 */

import React from "react";
import { Loader2, AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Shared Types ─────────────────────────────────────────────────────────────

/** Cell value type for SQLite rows */
export type CellValue = string | number | boolean | null;

export interface ColumnInfo {
  cid: number;
  name: string;
  type_name: string;
  notnull: boolean;
  dflt_value: string | null;
  pk: boolean;
}

export interface TableData {
  table_name: string;
  columns: ColumnInfo[];
  rows: Record<string, CellValue>[];
  total_rows: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rows_affected?: number;
  last_insert_rowid?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatCellValue(value: unknown, maxLength = 100): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  return s.length > maxLength ? s.substring(0, maxLength) + "..." : s;
}

export function getInputType(column: ColumnInfo): string {
  const type = column.type_name.toUpperCase();
  if (type.includes("INT")) return "number";
  if (
    type.includes("REAL") ||
    type.includes("FLOAT") ||
    type.includes("DOUBLE")
  )
    return "number";
  if (type.includes("BOOL")) return "checkbox";
  return "text";
}

function TruncatedCell({ value }: { value: unknown }) {
  const fullValue =
    value === null
      ? "NULL"
      : value === undefined
      ? ""
      : typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value);
  const formattedValue = formatCellValue(value, 50);
  const isTruncated = fullValue.length > 50;

  if (isTruncated) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help block truncate max-w-[200px]">
              {formattedValue}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="max-w-[500px] max-h-[300px] overflow-auto"
          >
            <pre className="text-xs whitespace-pre-wrap">{fullValue}</pre>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <span className="block truncate max-w-[200px]">{formattedValue}</span>
  );
}

// ─── EditRowDialog ────────────────────────────────────────────────────────────

export const EditRowDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  editingRow: Record<string, CellValue> | null;
  setEditingRow: (row: Record<string, CellValue>) => void;
  tableData: TableData | null;
  selectedTable: string;
  loading: boolean;
  onUpdate: (updates: Record<string, CellValue>) => void;
}> = ({
  open,
  onClose,
  editingRow,
  setEditingRow,
  tableData,
  selectedTable,
  loading,
  onUpdate,
}) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit Row</DialogTitle>
        <DialogDescription>
          Update the values for this row in the {selectedTable} table.
        </DialogDescription>
      </DialogHeader>
      {editingRow && tableData && (
        <div className="space-y-4">
          {tableData.columns.map((column) => (
            <div key={column.name} className="space-y-2">
              <Label htmlFor={`edit-${column.name}`}>
                {column.name}
                {column.pk && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (Primary Key)
                  </span>
                )}
              </Label>
              {getInputType(column) === "checkbox" ? (
                <input
                  type="checkbox"
                  id={`edit-${column.name}`}
                  checked={!!editingRow[column.name]}
                  onChange={(e) =>
                    setEditingRow({
                      ...editingRow,
                      [column.name]: e.target.checked,
                    })
                  }
                  disabled={column.pk}
                  className="h-4 w-4"
                />
              ) : (
                <Input
                  id={`edit-${column.name}`}
                  type={getInputType(column)}
                  value={String(editingRow[column.name] ?? "")}
                  onChange={(e) =>
                    setEditingRow({
                      ...editingRow,
                      [column.name]: e.target.value,
                    })
                  }
                  disabled={column.pk}
                  placeholder={column.dflt_value || "NULL"}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Type: {column.type_name}
                {column.notnull && ", NOT NULL"}
                {column.dflt_value && `, Default: ${column.dflt_value}`}
              </p>
            </div>
          ))}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onUpdate(editingRow!)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─── NewRowDialog ─────────────────────────────────────────────────────────────

export const NewRowDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  newRow: Record<string, CellValue> | null;
  setNewRow: (row: Record<string, CellValue>) => void;
  tableData: TableData | null;
  selectedTable: string;
  loading: boolean;
  onInsert: (values: Record<string, CellValue>) => void;
}> = ({
  open,
  onClose,
  newRow,
  setNewRow,
  tableData,
  selectedTable,
  loading,
  onInsert,
}) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>New Row</DialogTitle>
        <DialogDescription>
          Add a new row to the {selectedTable} table.
        </DialogDescription>
      </DialogHeader>
      {newRow && tableData && (
        <div className="space-y-4">
          {tableData.columns.map((column) => (
            <div key={column.name} className="space-y-2">
              <Label htmlFor={`new-${column.name}`}>
                {column.name}
                {column.notnull && (
                  <span className="text-xs text-destructive ml-2">
                    (Required)
                  </span>
                )}
              </Label>
              {getInputType(column) === "checkbox" ? (
                <input
                  type="checkbox"
                  id={`new-${column.name}`}
                  checked={!!newRow[column.name]}
                  onChange={(e) =>
                    setNewRow({
                      ...newRow,
                      [column.name]: e.target.checked,
                    })
                  }
                  className="h-4 w-4"
                />
              ) : (
                <Input
                  id={`new-${column.name}`}
                  type={getInputType(column)}
                  value={String(newRow[column.name] ?? "")}
                  onChange={(e) =>
                    setNewRow({ ...newRow, [column.name]: e.target.value })
                  }
                  placeholder={column.dflt_value || "NULL"}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Type: {column.type_name}
                {column.dflt_value && `, Default: ${column.dflt_value}`}
              </p>
            </div>
          ))}
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onInsert(newRow!)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Insert"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─── DeleteRowDialog ──────────────────────────────────────────────────────────

export const DeleteRowDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  deletingRow: Record<string, CellValue> | null;
  loading: boolean;
  onDelete: () => void;
}> = ({ open, onClose, deletingRow, loading, onDelete }) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete Row</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete this row? This action cannot be
          undone.
        </DialogDescription>
      </DialogHeader>
      {deletingRow && (
        <div className="rounded-md bg-muted p-4">
          <pre className="text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(deletingRow).map(([key, value]) => [
                  key,
                  typeof value === "string" && value.length > 100
                    ? value.substring(0, 100) + "..."
                    : value,
                ])
              ),
              null,
              2
            )}
          </pre>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onDelete} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─── ResetDatabaseDialog ──────────────────────────────────────────────────────

export const ResetDatabaseDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  loading: boolean;
  onReset: () => void;
}> = ({ open, onClose, loading, onReset }) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reset Database</DialogTitle>
        <DialogDescription>
          This will delete all data and recreate the database with its default
          structure (empty tables for agents, agent_runs, and app_settings).
          The database will be restored to the same state as when you first
          installed the app. This action cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-3 p-4 rounded-md bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        <span className="text-sm font-medium">
          All your agents, runs, and settings will be permanently deleted!
        </span>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onReset} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Reset Database"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─── SqlEditorDialog ──────────────────────────────────────────────────────────

export const SqlEditorDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  sqlQuery: string;
  setSqlQuery: (q: string) => void;
  sqlResult: QueryResult | null;
  sqlError: string | null;
  loading: boolean;
  onExecute: () => void;
  formatCellValue: (value: unknown, maxLength?: number) => string;
}> = ({
  open,
  onClose,
  sqlQuery,
  setSqlQuery,
  sqlResult,
  sqlError,
  loading,
  onExecute,
}) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent className="max-w-4xl max-h-[80vh]">
      <DialogHeader>
        <DialogTitle>SQL Query Editor</DialogTitle>
        <DialogDescription>
          Execute raw SQL queries on the database. Use with caution.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sql-query">SQL Query</Label>
          <Textarea
            id="sql-query"
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            placeholder="SELECT * FROM agents LIMIT 10;"
            className="font-mono text-sm h-32"
          />
        </div>

        {sqlError && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <div className="flex items-center gap-2">
              <X className="h-4 w-4" />
              {sqlError}
            </div>
          </div>
        )}

        {sqlResult && (
          <div className="space-y-2">
            {sqlResult.rows_affected !== undefined ? (
              <div className="p-3 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-sm">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Query executed successfully. {sqlResult.rows_affected} rows
                  affected.
                  {sqlResult.last_insert_rowid && (
                    <span>
                      Last insert ID: {sqlResult.last_insert_rowid}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {sqlResult.columns.map((col, i) => (
                          <th
                            key={i}
                            className="px-2 py-1 text-left font-medium"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sqlResult.rows.map((row, i) => (
                        <tr key={i} className="border-b">
                          {row.map((cell, j) => (
                            <td key={j} className="px-2 py-1 font-mono">
                              <TruncatedCell value={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={onClose}
        >
          Close
        </Button>
        <Button
          onClick={onExecute}
          disabled={loading || !sqlQuery.trim()}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Execute"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
