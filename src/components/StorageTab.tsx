import React, { useState, useEffect, useCallback } from "react";
import {
  Database,
  Search,
  Plus,
  RefreshCw,
  Terminal,
  AlertTriangle,
  Table,
  Loader2,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { getEnvironmentInfo } from "@/lib/apiAdapter";
import { Toast, ToastContainer } from "./ui/toast";
import {
  EditRowDialog,
  NewRowDialog,
  DeleteRowDialog,
  ResetDatabaseDialog,
  SqlEditorDialog,
  formatCellValue,
  type ColumnInfo,
  type TableData,
  type QueryResult,
} from "./storage/StorageDialogs";
import { StorageDataTable } from "./storage/StorageDataTable";

interface TableInfo {
  name: string;
  row_count: number;
  columns: ColumnInfo[];
}

/**
 * StorageTab — SQLite database viewer/editor.
 * Shows a desktop-only message when running in web server mode.
 */
export const StorageTab: React.FC = () => {
  const isWebMode = !getEnvironmentInfo().isTauri;
  if (isWebMode) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <Monitor className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold mb-1">Desktop Only</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              The database storage viewer requires the desktop app. SQLite
              storage is not accessible in web server mode.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  return <StorageTabInner />;
};

const StorageTabInner: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);
  const [newRow, setNewRow] = useState<Record<string, any> | null>(null);
  const [deletingRow, setDeletingRow] = useState<Record<string, any> | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSqlEditor, setShowSqlEditor] = useState(false);
  const [sqlQuery, setSqlQuery] = useState("");
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => { loadTables(); }, []);
  useEffect(() => { if (selectedTable) loadTableData(1); }, [selectedTable]);

  const loadTables = async () => {
    try {
      setLoading(true); setError(null);
      const result = await api.storageListTables();
      const tables = result as TableInfo[];
      setTables(tables);
      if (tables.length > 0 && !selectedTable) setSelectedTable(tables[0].name);
    } catch { setError("Failed to load tables"); }
    finally { setLoading(false); }
  };

  const loadTableData = async (page: number, search?: string) => {
    if (!selectedTable) return;
    try {
      setLoading(true); setError(null);
      const result = await api.storageReadTable(selectedTable, page, pageSize, search || searchQuery || undefined) as TableData;
      setTableData(result); setCurrentPage(page);
    } catch { setError("Failed to load table data"); }
    finally { setLoading(false); }
  };

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value); loadTableData(1, value);
  }, [selectedTable]);

  const getPKValues = (row: Record<string, any>) => {
    if (!tableData) return {};
    return Object.fromEntries(tableData.columns.filter((c) => c.pk).map((c) => [c.name, row[c.name]]));
  };

  const handleUpdateRow = async (updates: Record<string, any>) => {
    if (!editingRow || !selectedTable) return;
    try {
      setLoading(true);
      await api.storageUpdateRow(selectedTable, getPKValues(editingRow), updates);
      await loadTableData(currentPage); setEditingRow(null);
    } catch { setError("Failed to update row"); }
    finally { setLoading(false); }
  };

  const handleDeleteRow = async () => {
    if (!deletingRow || !selectedTable) return;
    try {
      setLoading(true);
      await api.storageDeleteRow(selectedTable, getPKValues(deletingRow));
      await loadTableData(currentPage); setDeletingRow(null);
    } catch { setError("Failed to delete row"); }
    finally { setLoading(false); }
  };

  const handleInsertRow = async (values: Record<string, any>) => {
    if (!selectedTable) return;
    try {
      setLoading(true);
      await api.storageInsertRow(selectedTable, values);
      await loadTableData(currentPage); setNewRow(null);
    } catch { setError("Failed to insert row"); }
    finally { setLoading(false); }
  };

  const handleExecuteSql = async () => {
    try {
      setLoading(true); setSqlError(null);
      const result = await api.storageExecuteSql(sqlQuery) as QueryResult;
      setSqlResult(result);
      if (result.rows_affected !== undefined) {
        await loadTables();
        if (selectedTable) await loadTableData(currentPage);
      }
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : "Failed to execute SQL");
    } finally { setLoading(false); }
  };

  const handleResetDatabase = async () => {
    try {
      setLoading(true);
      await api.storageResetDatabase();
      await loadTables(); setSelectedTable(""); setTableData(null); setShowResetConfirm(false);
      setToast({ message: "Database Reset Complete: The database has been restored to its default state with empty tables (agents, agent_runs, app_settings).", type: "success" });
    } catch {
      setError("Failed to reset database");
      setToast({ message: "Reset Failed: Failed to reset the database. Please try again.", type: "error" });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Database Storage</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSqlEditor(true)} className="gap-2 h-8 text-xs">
                <Terminal className="h-3 w-3" /> SQL Query
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowResetConfirm(true)} className="gap-2 h-8 text-xs">
                <RefreshCw className="h-3 w-3" /> Reset DB
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select value={selectedTable} onValueChange={setSelectedTable}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Select a table">
                  {selectedTable && (
                    <div className="flex items-center gap-2">
                      <Table className="h-3 w-3" />{selectedTable}
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table.name} value={table.name} className="text-xs">
                    <div className="flex items-center justify-between w-full">
                      <span>{table.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{table.row_count} rows</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search in table..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            {tableData && (
              <Button variant="outline" size="sm" onClick={() => setNewRow({})} className="gap-2 h-8 text-xs">
                <Plus className="h-3 w-3" /> New Row
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Table Data */}
      {tableData && (
        <StorageDataTable
          tableData={tableData}
          currentPage={currentPage}
          pageSize={pageSize}
          onEditRow={setEditingRow}
          onDeleteRow={setDeletingRow}
          onPageChange={loadTableData}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card className="p-6 border-destructive/50 bg-destructive/10">
          <div className="flex items-center gap-3 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">{error}</span>
          </div>
        </Card>
      )}

      <EditRowDialog
        open={!!editingRow} onClose={() => setEditingRow(null)}
        editingRow={editingRow} setEditingRow={setEditingRow}
        tableData={tableData} selectedTable={selectedTable}
        loading={loading} onUpdate={handleUpdateRow}
      />
      <NewRowDialog
        open={!!newRow} onClose={() => setNewRow(null)}
        newRow={newRow} setNewRow={setNewRow}
        tableData={tableData} selectedTable={selectedTable}
        loading={loading} onInsert={handleInsertRow}
      />
      <DeleteRowDialog
        open={!!deletingRow} onClose={() => setDeletingRow(null)}
        deletingRow={deletingRow} loading={loading} onDelete={handleDeleteRow}
      />
      <ResetDatabaseDialog
        open={showResetConfirm} onClose={() => setShowResetConfirm(false)}
        loading={loading} onReset={handleResetDatabase}
      />
      <SqlEditorDialog
        open={showSqlEditor}
        onClose={() => { setShowSqlEditor(false); setSqlQuery(""); setSqlResult(null); setSqlError(null); }}
        sqlQuery={sqlQuery} setSqlQuery={setSqlQuery}
        sqlResult={sqlResult} sqlError={sqlError}
        loading={loading} onExecute={handleExecuteSql}
        formatCellValue={formatCellValue}
      />

      <ToastContainer>
        {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      </ToastContainer>
    </div>
  );
};
