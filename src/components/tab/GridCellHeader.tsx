/**
 * GridCellHeader — the drag handle bar rendered at the top of each grid cell.
 * Contains: cell number, title, status indicator, env badge, size picker, action buttons.
 */
import React from 'react';
import { GripVertical, Maximize2, Minimize2, TerminalSquare, Globe, Ungroup, X, Server, Container, Monitor } from 'lucide-react';
import type { Tab } from '@/contexts/TabContext';
import type { RemoteEnvironment } from '@/components/settings/EnvironmentsSettings';

interface GridCellHeaderProps {
  tab: Tab;
  cellNumber: number;
  isFocused: boolean;
  colSpan: number;
  rowSpan: number;
  cols: number;
  spanPickerTabId: string | null;
  gridProjectPaths: Set<string>;
  envMap: Map<string, RemoteEnvironment>;
  canAddTab: () => boolean;
  gridOrder: string[];

  onDragStart: (tabId: string) => void;
  onDragOver: (e: React.DragEvent, tabId: string) => void;
  onDragEnd: () => void;
  onDrop: (tabId: string) => void;

  onSpanPickerToggle: (tabId: string) => void;
  onSetColSpan: (tabId: string, colSpan: number) => void;
  onSetRowSpan: (tabId: string, rowSpan: number) => void;
  onResetSpan: (tabId: string) => void;

  onOpenShell: (tab: Tab) => void;
  onOpenBrowser: (tab: Tab) => void;
  onSeparate: (tab: Tab) => void;
  onClose: (tabId: string) => void;
}

export function GridCellHeader({
  tab,
  cellNumber,
  isFocused,
  colSpan,
  rowSpan,
  cols,
  spanPickerTabId,
  gridProjectPaths,
  envMap,
  canAddTab,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onSpanPickerToggle,
  onSetColSpan,
  onSetRowSpan,
  onResetSpan,
  onOpenShell,
  onOpenBrowser,
  onSeparate,
  onClose,
}: GridCellHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between px-2 py-1 border-b border-border text-xs transition-colors cursor-grab active:cursor-grabbing ${
        isFocused ? 'bg-primary/10 text-foreground' : 'bg-muted/20 text-muted-foreground'
      }`}
      draggable
      onDragStart={() => onDragStart(tab.id)}
      onDragOver={(e) => onDragOver(e, tab.id)}
      onDragEnd={onDragEnd}
      onDrop={() => onDrop(tab.id)}
    >
      {/* Left side: number + status + title */}
      <div className="flex items-center gap-1 min-w-0">
        <GripVertical className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
        <kbd className={`text-[9px] px-1 py-0.5 rounded font-mono leading-none flex-shrink-0 ${
          isFocused ? 'bg-primary/20 text-primary' : 'bg-muted/40 text-muted-foreground/50'
        }`}>{cellNumber}</kbd>
        {tab.status === 'running' && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
        )}
        <span className="font-medium truncate">{tab.title}</span>
        {(colSpan > 1 || rowSpan > 1) && (
          <span className="text-[9px] text-primary/60 font-mono flex-shrink-0">{colSpan}×{rowSpan}</span>
        )}
      </div>

      {/* Right side: env badge + action buttons */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* Environment badge */}
        {tab.environmentId && (() => {
          const env = envMap.get(tab.environmentId);
          if (!env) return null;
          const EnvIcon = env.type === 'ssh' ? Server : env.type === 'docker' ? Container : Monitor;
          const colors = env.type === 'ssh' ? 'bg-blue-500/10 text-blue-400/60' : env.type === 'docker' ? 'bg-cyan-500/10 text-cyan-400/60' : 'bg-purple-500/10 text-purple-400/60';
          return (
            <span className={`text-[8px] px-1 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0 ${colors}`} title={`${env.type.toUpperCase()}: ${env.name}`}>
              <EnvIcon className="w-2.5 h-2.5" />
              <span className="max-w-[60px] truncate">{env.name}</span>
            </span>
          );
        })()}

        {/* Size picker */}
        <div className="relative">
          <button
            className="text-muted-foreground/50 hover:text-foreground p-0.5"
            title={`Size: ${colSpan}×${rowSpan} — click to change`}
            onClick={(e) => { e.stopPropagation(); onSpanPickerToggle(tab.id); }}
          >
            {colSpan > 1 || rowSpan > 1 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          {spanPickerTabId === tab.id && (
            <div
              className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-xl p-2 min-w-[140px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider mb-1.5 px-1">Cell size</div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground px-1">Columns</span>
                <div className="flex gap-0.5">
                  {Array.from({ length: cols }, (_, i) => i + 1).map(n => (
                    <button key={n} onClick={() => onSetColSpan(tab.id, n)}
                      className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${
                        colSpan === n ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >{n}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground px-1">Rows</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3].map(n => (
                    <button key={n} onClick={() => onSetRowSpan(tab.id, n)}
                      className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${
                        rowSpan === n ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >{n}</button>
                  ))}
                </div>
              </div>
              {(colSpan > 1 || rowSpan > 1) && (
                <button
                  onClick={() => onResetSpan(tab.id)}
                  className="w-full text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded py-1 transition-colors"
                >
                  Reset to 1×1
                </button>
              )}
            </div>
          )}
        </div>

        {/* Open shell */}
        {canAddTab() && (
          <button className="text-muted-foreground/50 hover:text-foreground p-0.5 relative z-20"
            onClick={(e) => { e.stopPropagation(); onOpenShell(tab); }}
            title="Open shell for this project"
            aria-label="Open shell for this project"
          >
            <TerminalSquare className="w-3 h-3" />
          </button>
        )}

        {/* Open browser */}
        {canAddTab() && (
          <button className="text-muted-foreground/50 hover:text-foreground p-0.5 relative z-20"
            onClick={(e) => { e.stopPropagation(); onOpenBrowser(tab); }}
            title="Open browser for this project"
            aria-label="Open browser for this project"
          >
            <Globe className="w-3 h-3" />
          </button>
        )}

        {/* Separate from grid */}
        {gridProjectPaths.size > 1 && tab.initialProjectPath && tab.initialProjectPath !== tab.projectPath && (
          <button className="text-muted-foreground/50 hover:text-amber-400 p-0.5 relative z-20"
            onClick={(e) => { e.stopPropagation(); onSeparate(tab); }}
            title="Separate to own grid"
            aria-label="Separate to own grid"
          >
            <Ungroup className="w-3 h-3" />
          </button>
        )}

        {/* Close */}
        <button className="text-muted-foreground hover:text-foreground p-0.5 relative z-20"
          onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
          aria-label="Close tab"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
