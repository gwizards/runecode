import React from 'react';
import { Plus, Columns, Rows3, GripVertical, LayoutGrid } from 'lucide-react';
import { getTabProjectPath, type Tab } from '@/contexts/TabContext';
import type { RemoteEnvironment } from '@/components/settings/EnvironmentsSettings';
import { Button } from '@/components/ui/button';
import { TabPanel } from './TabPanelContent';
import { GridCell } from './GridCell';
import { GridCellHeader } from './GridCellHeader';

interface GridConfig {
  columns: number;
  rows: number;
  order: string[];
  spans: Record<string, { colSpan?: number; rowSpan?: number }>;
}

export interface SplitPaneTabProps {
  tabs: Tab[];
  activeTabId: string | null;
  layoutMode: 'single' | 'grid';
  gridConfig: GridConfig;
  orderedGridTabs: Tab[];
  nonGridTabs: Tab[];
  inactiveProjectTabs: Tab[];
  allGridTabs: Tab[];
  allGridGroupKeys: string[];
  gridProjectPaths: Set<string>;
  activeProjectPath: string | null;
  envMap: Map<string, RemoteEnvironment>;
  canAddTab: () => boolean;
  setLayoutMode: (mode: 'single' | 'grid') => void;
  switchToTab: (id: string) => void;
  closeTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  setActiveProjectPath: (path: string) => void;
  setGridColumns: (n: number) => void;
  setGridRows: (n: number) => void;
  setGridOrder: (order: string[]) => void;
  setGridSpan: (tabId: string, span: { colSpan?: number; rowSpan?: number }) => void;
  createProjectsTab: () => string;
  createTerminalTab: (sessionId?: string, projectPath?: string, flags?: string[]) => string;
  createBrowserTab: (url?: string, projectPath?: string) => string;
}

export function GridView({
  tabs,
  activeTabId,
  gridConfig,
  orderedGridTabs,
  nonGridTabs,
  inactiveProjectTabs,
  // allGridGroupKeys not used inside GridView
  gridProjectPaths,
  envMap,
  canAddTab,
  setLayoutMode,
  switchToTab,
  closeTab,
  updateTab,
  setActiveProjectPath,
  setGridColumns,
  setGridRows,
  setGridOrder,
  setGridSpan,
  createProjectsTab,
  createTerminalTab,
  createBrowserTab,
}: SplitPaneTabProps) {
  // Span picker popover state — close on outside click
  const [spanPickerTabId, setSpanPickerTabId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!spanPickerTabId) return;
    const handler = () => setSpanPickerTabId(null);
    const timer = setTimeout(() => window.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); window.removeEventListener('click', handler); };
  }, [spanPickerTabId]);

  // Drag state for grid cells
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);

  const handleGridDragStart = React.useCallback((tabId: string) => setDragId(tabId), []);
  const handleGridDragOver = React.useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault(); setDragOverId(tabId);
  }, []);
  const handleGridDrop = React.useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = orderedGridTabs.map(t => t.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1); ids.splice(toIdx, 0, dragId);
    setGridOrder(ids); setDragId(null); setDragOverId(null);
  }, [dragId, orderedGridTabs, setGridOrder]);

  // Footer tab drag state
  const [footerDragId, setFooterDragId] = React.useState<string | null>(null);
  const [footerDragOverId, setFooterDragOverId] = React.useState<string | null>(null);
  const handleFooterDrop = React.useCallback((targetId: string) => {
    if (!footerDragId || footerDragId === targetId) { setFooterDragId(null); setFooterDragOverId(null); return; }
    const ids = orderedGridTabs.map(t => t.id);
    const fromIdx = ids.indexOf(footerDragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1); ids.splice(toIdx, 0, footerDragId);
    setGridOrder(ids); setFooterDragId(null); setFooterDragOverId(null);
  }, [footerDragId, orderedGridTabs, setGridOrder]);

  if (orderedGridTabs.length === 0) {
    const hasNonGrid = nonGridTabs.some(t => t.id === activeTabId);
    return (
      <div className="flex-1 h-full relative flex flex-col">
        {inactiveProjectTabs.length > 0 && (
          <div style={{ display: 'none' }}>
            {inactiveProjectTabs.map(tab => <TabPanel key={tab.id} tab={tab} isActive={false} />)}
          </div>
        )}
        {hasNonGrid ? (
          nonGridTabs.map((tab) => <TabPanel key={tab.id} tab={tab} isActive={tab.id === activeTabId} />)
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">No windows in grid</p>
              <p className="text-sm mb-4">Open a project to get started</p>
              <Button onClick={() => createProjectsTab()} size="default">
                <Plus className="w-4 h-4 mr-2" /> New Project
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeIsNonGrid = nonGridTabs.some(t => t.id === activeTabId);
  const cols = gridConfig.columns;
  const rows = gridConfig.rows;

  return (
    <div className="flex-1 h-full relative flex flex-col">
      <div style={{ display: 'none' }}>
        {inactiveProjectTabs.map(tab => <TabPanel key={tab.id} tab={tab} isActive={false} />)}
      </div>

      <div
        className="flex-1 min-h-0"
        style={{
          display: activeIsNonGrid ? 'none' : 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: rows > 0 ? `repeat(${rows}, 1fr)` : undefined,
          gridAutoRows: rows > 0 ? undefined : '1fr',
          gap: '1px',
          background: 'hsl(var(--border))',
        }}
      >
        {orderedGridTabs.map((tab, gridIdx) => {
          const isFocused = tab.id === activeTabId;
          const span = gridConfig.spans[tab.id];
          const colSpan = span?.colSpan || 1;
          const rowSpan = span?.rowSpan || 1;
          const isDragTarget = dragOverId === tab.id && dragId !== tab.id;
          return (
            <GridCell
              key={tab.id}
              tabId={tab.id}
              isFocused={isFocused}
              switchToTab={switchToTab}
              className="relative bg-background overflow-hidden cursor-pointer transition-[filter,opacity] duration-300"
              style={{
                gridColumn: colSpan > 1 ? `span ${Math.min(colSpan, cols)}` : undefined,
                gridRow: rowSpan > 1 ? `span ${rowSpan}` : undefined,
                outline: isDragTarget ? '2px dashed hsl(var(--primary))' : isFocused ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                outlineOffset: '-2px',
                filter: isFocused ? 'none' : 'grayscale(0.75) brightness(0.6)',
                contain: 'layout style',
                opacity: dragId === tab.id ? 0.5 : 1,
              }}
              onClick={() => switchToTab(tab.id)}
              onDoubleClick={(e) => { e.stopPropagation(); setLayoutMode('single'); switchToTab(tab.id); }}
            >
              <GridCellHeader
                tab={tab}
                cellNumber={gridIdx + 1}
                isFocused={isFocused}
                colSpan={colSpan}
                rowSpan={rowSpan}
                cols={cols}
                spanPickerTabId={spanPickerTabId}
                gridProjectPaths={gridProjectPaths}
                envMap={envMap}
                canAddTab={canAddTab}
                gridOrder={gridConfig.order}
                onDragStart={handleGridDragStart}
                onDragOver={handleGridDragOver}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                onDrop={handleGridDrop}
                onSpanPickerToggle={(id) => setSpanPickerTabId(prev => prev === id ? null : id)}
                onSetColSpan={(id, n) => setGridSpan(id, { colSpan: n })}
                onSetRowSpan={(id, n) => setGridSpan(id, { rowSpan: n })}
                onResetSpan={(id) => { setGridSpan(id, { colSpan: 1, rowSpan: 1 }); setSpanPickerTabId(null); }}
                onOpenShell={(t) => {
                  const realProject = t.initialProjectPath || t.projectPath;
                  const gridKey = t.projectPath || t.initialProjectPath;
                  const newId = createTerminalTab(undefined, realProject, ['--shell']);
                  updateTab(newId, { projectPath: gridKey, initialProjectPath: realProject });
                  const order = [...gridConfig.order];
                  const idx = order.indexOf(t.id);
                  if (idx >= 0) { order.splice(idx + 1, 0, newId); setGridOrder(order); }
                }}
                onOpenBrowser={(t) => {
                  const realProject = t.initialProjectPath || t.projectPath;
                  const gridKey = t.projectPath || t.initialProjectPath;
                  const newId = createBrowserTab(undefined, gridKey);
                  updateTab(newId, { initialProjectPath: realProject });
                  const order = [...gridConfig.order];
                  const idx = order.indexOf(t.id);
                  if (idx >= 0) { order.splice(idx + 1, 0, newId); setGridOrder(order); }
                }}
                onSeparate={(t) => {
                  updateTab(t.id, { projectPath: t.initialProjectPath });
                  setActiveProjectPath(t.initialProjectPath!);
                }}
                onClose={closeTab}
              />
              <div className="h-[calc(100%-28px)] overflow-hidden">
                <TabPanel tab={tab} isActive={!activeIsNonGrid} ownsFooter={isFocused} />
              </div>
            </GridCell>
          );
        })}
      </div>

      {/* Grid footer */}
      {!activeIsNonGrid && orderedGridTabs.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-muted/20 border-t border-border shrink-0">
          <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
            {orderedGridTabs.map((tab, idx) => {
              const isFocused = tab.id === activeTabId;
              const isFooterDragTarget = footerDragOverId === tab.id && footerDragId !== tab.id;
              return (
                <button
                  key={tab.id}
                  draggable
                  onDragStart={() => setFooterDragId(tab.id)}
                  onDragOver={(e) => { e.preventDefault(); setFooterDragOverId(tab.id); }}
                  onDragEnd={() => { setFooterDragId(null); setFooterDragOverId(null); }}
                  onDrop={() => handleFooterDrop(tab.id)}
                  onClick={() => switchToTab(tab.id)}
                  className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                    isFocused ? 'bg-primary/15 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  } ${isFooterDragTarget ? 'ring-1 ring-primary' : ''}`}
                  style={{ opacity: footerDragId === tab.id ? 0.4 : 1 }}
                >
                  <GripVertical className="w-2.5 h-2.5 text-muted-foreground/30 cursor-grab flex-shrink-0" />
                  {tab.status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />}
                  <span className="truncate max-w-[80px]">{tab.title}</span>
                  <kbd className={`text-[9px] px-1 py-0.5 rounded font-mono leading-none ${isFocused ? 'bg-primary/20 text-primary' : 'bg-muted/60 text-muted-foreground'}`}>{idx + 1}</kbd>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 flex-shrink-0 px-2 border-l border-border/50">
            <kbd className="px-1 py-0.5 rounded bg-muted/40 font-mono text-[9px] leading-none">Tab</kbd>
            <span className="text-muted-foreground/30">cycle</span>
            <kbd className="px-1 py-0.5 rounded bg-muted/40 font-mono text-[9px] leading-none">Ctrl+1-9</kbd>
            <span className="text-muted-foreground/30">jump</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 pl-2 border-l border-border">
            <div className="flex items-center gap-0.5">
              <Columns className="w-3 h-3 text-muted-foreground/40" />
              {[1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => setGridColumns(n)}
                  className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${cols === n ? 'bg-primary/15 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40'}`}
                >{n}</button>
              ))}
            </div>
            <div className="flex items-center gap-0.5">
              <Rows3 className="w-3 h-3 text-muted-foreground/40" />
              {[0, 1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => setGridRows(n)}
                  className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${rows === n ? 'bg-primary/15 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40'}`}
                  title={n === 0 ? 'Auto rows' : `${n} rows`}
                >{n === 0 ? 'A' : n}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {nonGridTabs.map((tab) => (
        <TabPanel key={tab.id} tab={tab} isActive={activeIsNonGrid && tab.id === activeTabId} />
      ))}

      {tabs.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">No projects open</p>
            <Button onClick={() => createProjectsTab()} size="default">
              <Plus className="w-4 h-4 mr-2" /> New Project
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface SingleViewProps {
  tabs: Tab[];
  activeTabId: string | null;
  showGridActions: boolean;
  activeTabSingle: Tab | null;
  allGridGroupKeys: string[];
  setLayoutMode: (mode: 'single' | 'grid') => void;
  switchToTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  setActiveProjectPath: (path: string) => void;
  createProjectsTab: () => string;
}

export function SingleView({
  tabs,
  activeTabId,
  showGridActions,
  activeTabSingle,
  allGridGroupKeys,
  setLayoutMode,
  // switchToTab not called directly — TabPanel handles its own switching
  updateTab,
  setActiveProjectPath,
  createProjectsTab,
}: SingleViewProps) {
  const [moveToGridTabId, setMoveToGridTabId] = React.useState<string | null>(null);

  return (
    <div className="flex-1 h-full relative">
      {showGridActions && activeTabSingle && (
        <div className="absolute top-2 right-2 z-30 flex items-center gap-1">
          <button
            onClick={() => {
              setLayoutMode('grid');
              const pp = getTabProjectPath(activeTabSingle);
              if (pp) setActiveProjectPath(pp);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/90 border border-border/40 text-[10px] text-muted-foreground hover:text-foreground hover:border-border/60 backdrop-blur-sm transition-colors"
            title="Convert to grid view"
          >
            <LayoutGrid className="w-3 h-3" />
            Grid
          </button>
          {allGridGroupKeys.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setMoveToGridTabId(prev => prev === activeTabSingle.id ? null : activeTabSingle.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/90 border border-border/40 text-[10px] text-muted-foreground hover:text-foreground hover:border-border/60 backdrop-blur-sm transition-colors"
                title="Join existing grid"
              >
                <Plus className="w-3 h-3" />
                Join Grid
              </button>
              {moveToGridTabId === activeTabSingle.id && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-xl p-1.5 min-w-[160px]">
                  <div className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider mb-1 px-2">Join grid</div>
                  {allGridGroupKeys.map(key => {
                    const name = key.split('/').pop() || key;
                    const isSelf = key === getTabProjectPath(activeTabSingle);
                    return (
                      <button key={key} disabled={isSelf}
                        onClick={() => {
                          updateTab(activeTabSingle.id, { projectPath: key });
                          setLayoutMode('grid');
                          setActiveProjectPath(key);
                          setMoveToGridTabId(null);
                        }}
                        className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                          isSelf ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        }`}
                      >
                        {name}
                        {isSelf && <span className="ml-1 text-[9px] opacity-50">(current)</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tabs.map((tab) => (
        <TabPanel key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
      ))}

      {tabs.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">No projects open</p>
            <p className="text-sm mb-4">Click to start a new project</p>
            <Button onClick={() => createProjectsTab()} size="default">
              <Plus className="w-4 h-4 mr-2" /> New Project
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
