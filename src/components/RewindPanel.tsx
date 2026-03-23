import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, FileText, X, AlertTriangle, ChevronLeft, Search, AlertCircle } from 'lucide-react';
import { rewindSessionFiles } from '@/lib/apiAdapter';

interface RewindPanelProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string | null;
  sessionId: string | null;
  projectPath: string;
  messages: Array<{ type: string; uuid?: string; message?: any; timestamp?: string }>;
  embedded?: boolean;
}

interface CheckpointItem {
  index: number;
  uuid: string;
  preview: string;
  date?: Date;
  model?: string;
  toolCount: number;
}

type FilterMode = 'all' | 'with-tools' | 'text-only';
type ConfirmAction = null | 'code_and_conversation' | 'code_only';

function getDateGroup(date: Date | undefined): string {
  if (!date) return 'Unknown';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(date: Date | undefined): string {
  if (!date) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const RewindPanel: React.FC<RewindPanelProps> = ({
  isOpen, onClose, connectionId, sessionId: _sessionId, projectPath: _projectPath, messages, embedded,
}) => {
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ filesChanged: string[]; insertions: number; deletions: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const hasActiveSession = !!connectionId;

  // Extract checkpoints
  const allCheckpoints = useMemo(() => {
    const result: CheckpointItem[] = [];
    let turnIndex = 0;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.type !== 'user' || !m.uuid) continue;
      const content = m.message?.content;
      if (Array.isArray(content) && content.every((b: any) => b.type === 'tool_result')) continue;

      turnIndex++;
      let previewText = `Message ${turnIndex}`;
      if (typeof content === 'string') previewText = content;
      else if (Array.isArray(content)) {
        const tb = content.find((b: any) => b.type === 'text');
        if (tb?.text) previewText = tb.text;
      }

      let model: string | undefined;
      let toolCount = 0;
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].type === 'user') break;
        if (messages[j].type === 'assistant') {
          if (!model && messages[j].message?.model) model = messages[j].message.model;
          if (Array.isArray(messages[j].message?.content))
            toolCount += messages[j].message.content.filter((b: any) => b.type === 'tool_use').length;
        }
      }

      const ts = m.timestamp || m.message?.timestamp;
      const date = ts ? new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : ts) : undefined;

      result.push({
        index: turnIndex, uuid: m.uuid!, preview: previewText, date,
        model: model?.replace(/claude-/g, '').replace(/-\d+[km]?$/g, '').replace(/-/g, ' '),
        toolCount,
      });
    }
    return result;
  }, [messages]);

  // Filter + search
  const filtered = useMemo(() => {
    let items = allCheckpoints;
    if (search) { const q = search.toLowerCase(); items = items.filter(c => c.preview.toLowerCase().includes(q)); }
    if (filter === 'with-tools') items = items.filter(c => c.toolCount > 0);
    if (filter === 'text-only') items = items.filter(c => c.toolCount === 0);
    return items;
  }, [allCheckpoints, search, filter]);

  // Paginate — show 10 at a time, newest first
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible count when search/filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, filter]);

  // Group by date (only the visible slice)
  const { grouped, totalCount, hasMore } = useMemo(() => {
    const reversed = [...filtered].reverse();
    const total = reversed.length;
    const sliced = reversed.slice(0, visibleCount);
    const groups: { label: string; items: CheckpointItem[] }[] = [];
    let currentLabel = '';
    for (const item of sliced) {
      const label = getDateGroup(item.date);
      if (label !== currentLabel) { groups.push({ label, items: [] }); currentLabel = label; }
      groups[groups.length - 1].items.push(item);
    }
    return { grouped: groups, totalCount: total, hasMore: visibleCount < total };
  }, [filtered, visibleCount]);

  const resetSelection = () => { setSelectedUuid(null); setPreview(null); setLoading(false); setError(null); setConfirmAction(null); };

  // Listen for rewind preview results
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const data = e.detail;
      if (data.canRewind === false) { setError(data.error || 'Cannot rewind to this point'); setLoading(false); return; }
      setPreview({ filesChanged: data.filesChanged || [], insertions: data.insertions || 0, deletions: data.deletions || 0 });
      setLoading(false);
    };
    window.addEventListener('runecode:rewind-result', handler as EventListener);
    return () => window.removeEventListener('runecode:rewind-result', handler as EventListener);
  }, []);

  const handlePreview = () => {
    if (!selectedUuid) return;
    if (!hasActiveSession) { setError('Preview requires an active session. Send a message first.'); return; }
    setLoading(true); setError(null); setPreview(null);
    rewindSessionFiles(connectionId!, selectedUuid, true);
  };

  const executeRewind = (mode: 'code_and_conversation' | 'code_only') => {
    if (!selectedUuid) return;
    window.dispatchEvent(new CustomEvent('runecode:rewind', { detail: { userMessageId: selectedUuid, mode } }));
    resetSelection();
    onClose();
  };

  const selectedMessage = allCheckpoints.find(c => c.uuid === selectedUuid);
  if (!isOpen) return null;

  const content = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {(selectedUuid || confirmAction) && (
              <button onClick={confirmAction ? () => setConfirmAction(null) : resetSelection} className="text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <RotateCcw className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">
              {confirmAction ? 'Confirm Rewind' : selectedUuid ? `Rewind to #${selectedMessage?.index}` : 'Rewind Timeline'}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground/40">{allCheckpoints.length} points</span>
            <button onClick={onClose} className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {!selectedUuid && !confirmAction && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                className="w-full bg-white/[0.03] border border-border/20 rounded-md text-[11px] pl-7 pr-2 py-1.5 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30" />
            </div>
            <div className="flex gap-0.5">
              {(['all', 'with-tools', 'text-only'] as FilterMode[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-1.5 py-1 rounded text-[9px] font-medium transition-colors ${filter === f ? 'bg-primary/15 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}>
                  {f === 'all' ? 'All' : f === 'with-tools' ? '🔧' : '💬'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        <AnimatePresence mode="wait">

          {/* ── Confirmation dialog ── */}
          {confirmAction && selectedUuid && (
            <motion.div key="confirm-dialog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-3">
              <div className="flex items-start gap-3 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-3">
                <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-medium text-yellow-300">
                    {confirmAction === 'code_and_conversation' ? 'Rewind code & conversation?' : 'Rewind code only?'}
                  </p>
                  <p className="text-[10px] text-yellow-400/60 mt-1">
                    {confirmAction === 'code_and_conversation'
                      ? 'This will restore files to their state at this checkpoint AND remove all messages after it. This cannot be undone.'
                      : 'This will restore files to their state at this checkpoint. The conversation history will be kept. This cannot be undone.'}
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-border/20 bg-white/[0.02] px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-semibold">Reverting to</p>
                <p className="mt-0.5 text-[11px] text-foreground/80">{selectedMessage?.preview.slice(0, 100)}</p>
                {selectedMessage?.date && (
                  <p className="text-[9px] text-muted-foreground/30 mt-0.5">
                    {selectedMessage.date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>

              {!hasActiveSession && confirmAction === 'code_only' && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                  <AlertCircle className="h-3 w-3" />
                  No active session — file rewind requires sending a message first.
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setConfirmAction(null)}
                  className="flex-1 px-3 py-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors border border-border/20">
                  Cancel
                </button>
                <button
                  onClick={() => executeRewind(confirmAction)}
                  disabled={confirmAction === 'code_only' && !hasActiveSession}
                  className="flex-1 px-3 py-2 rounded-md text-[11px] font-medium bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  Confirm Rewind
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Checkpoint detail ── */}
          {selectedUuid && !confirmAction && (
            <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-4 space-y-3">
              <div className="rounded-md border border-border/20 bg-white/[0.02] px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-semibold">Checkpoint #{selectedMessage?.index}</p>
                <p className="mt-0.5 text-[11px] text-foreground/80 line-clamp-3">{selectedMessage?.preview}</p>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground/30">
                  {selectedMessage?.date && <span>{selectedMessage.date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                  {selectedMessage?.model && <span>{selectedMessage.model}</span>}
                  {selectedMessage?.toolCount ? <span>{selectedMessage.toolCount} tool calls</span> : null}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                  <AlertTriangle className="h-3 w-3 shrink-0" />{error}
                </div>
              )}

              {preview && (
                <div className="rounded-md border border-border/20 bg-white/[0.02] px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 font-semibold mb-1">File changes</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-1.5">
                    <span className="text-green-400">+{preview.insertions}</span>
                    <span className="text-red-400">-{preview.deletions}</span>
                    <span>{preview.filesChanged.length} file{preview.filesChanged.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 max-h-[120px] overflow-y-auto">
                    {preview.filesChanged.map(file => (
                      <div key={file} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                        <FileText className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{file.split('/').pop()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <button onClick={handlePreview} disabled={loading || !hasActiveSession}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={!hasActiveSession ? 'Requires active session' : undefined}>
                  <FileText className="h-3 w-3" />{loading ? 'Loading...' : 'Preview file changes'}
                </button>
                <button onClick={() => setConfirmAction('code_and_conversation')}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
                  <RotateCcw className="h-3 w-3" />Rewind code & conversation
                </button>
                <button onClick={() => setConfirmAction('code_only')} disabled={!hasActiveSession}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-medium text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/[0.04] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={!hasActiveSession ? 'Requires active session' : undefined}>
                  <RotateCcw className="h-3 w-3" />Rewind code only
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Checkpoint list (paginated) ── */}
          {!selectedUuid && !confirmAction && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-2">
              {grouped.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground/50">{search ? 'No matches.' : 'No rewind points yet.'}</p>
              ) : (
                <>
                  {grouped.map(group => (
                    <div key={group.label} className="mb-2">
                      <div className="px-3 py-1">
                        <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/30">{group.label}</span>
                      </div>
                      {group.items.map(msg => (
                        <button key={msg.uuid} onClick={() => { setSelectedUuid(msg.uuid); setError(null); setPreview(null); setConfirmAction(null); }}
                          className="group w-full flex items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-white/[0.04]">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-medium text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary">
                            {msg.index}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-muted-foreground group-hover:text-foreground leading-snug line-clamp-2">{msg.preview.slice(0, 120)}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground/30">
                              {msg.date && <span>{fmtTime(msg.date)}</span>}
                              {msg.model && <span>{msg.model}</span>}
                              {msg.toolCount > 0 && <span>{msg.toolCount} tools</span>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                  {hasMore && (
                    <button
                      onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                      className="w-full py-2.5 text-[11px] font-medium text-primary hover:bg-primary/10 rounded-md transition-colors"
                    >
                      Load more ({totalCount - visibleCount} remaining)
                    </button>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  if (embedded) return content;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border/30 bg-background shadow-xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>{content}</div>
    </div>
  );
};

export default RewindPanel;
