/**
 * StorageDataTable — renders the table data grid and pagination for StorageTab.
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Edit3, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCellValue, type TableData } from "./StorageDialogs";

interface StorageDataTableProps {
  tableData: TableData;
  currentPage: number;
  pageSize: number;
  onEditRow: (row: Record<string, any>) => void;
  onDeleteRow: (row: Record<string, any>) => void;
  onPageChange: (page: number) => void;
}

export const StorageDataTable: React.FC<StorageDataTableProps> = ({
  tableData,
  currentPage,
  pageSize,
  onEditRow,
  onDeleteRow,
  onPageChange,
}) => (
  <Card className="overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            {tableData.columns.map((column) => (
              <th
                key={column.name}
                className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                <div className="flex items-center gap-1">
                  {column.name}
                  {column.pk && (
                    <span className="text-[10px] text-primary">PK</span>
                  )}
                </div>
                <div className="text-[10px] font-normal">{column.type_name}</div>
              </th>
            ))}
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {tableData.rows.map((row, index) => (
              <motion.tr
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="border-b hover:bg-muted/25 transition-colors"
              >
                {tableData.columns.map((column) => {
                  const value = row[column.name];
                  const fullValue =
                    value === null ? "NULL" :
                    value === undefined ? "" :
                    typeof value === "object" ? JSON.stringify(value, null, 2) :
                    String(value);
                  const formattedValue = formatCellValue(value, 50);
                  const isTruncated = fullValue.length > 50;

                  return (
                    <td key={column.name} className="px-3 py-2 text-xs font-mono">
                      {isTruncated ? (
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
                      ) : (
                        <span className="block truncate max-w-[200px]">{formattedValue}</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEditRow(row)}
                      className="h-6 w-6"
                      aria-label="Edit row"
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDeleteRow(row)}
                      className="h-6 w-6 hover:text-destructive"
                      aria-label="Delete row"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>

    {/* Pagination */}
    {tableData.total_pages > 1 && (
      <div className="flex items-center justify-between p-3 border-t">
        <div className="text-xs text-muted-foreground">
          Showing {(currentPage - 1) * pageSize + 1} to{" "}
          {Math.min(currentPage * pageSize, tableData.total_rows)} of{" "}
          {tableData.total_rows} rows
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-7 text-xs"
          >
            <ChevronLeft className="h-3 w-3" />
            Previous
          </Button>
          <div className="text-xs">
            Page {currentPage} of {tableData.total_pages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === tableData.total_pages}
            className="h-7 text-xs"
          >
            Next
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )}
  </Card>
);
