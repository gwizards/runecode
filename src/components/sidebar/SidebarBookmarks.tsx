import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, Bookmark, Copy, X, Clipboard } from 'lucide-react';

interface BookmarkItem {
  id: string;
  text: string;
  source: 'clipboard' | 'bookmark';
  timestamp: number;
}

const STORAGE_KEY = 'runecode-bookmarks';

function loadBookmarks(): BookmarkItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveBookmarks(items: BookmarkItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 20))); // Max 20
}

export function SidebarBookmarks() {
  const [collapsed, setCollapsed] = useState(true);
  const [items, setItems] = useState<BookmarkItem[]>(loadBookmarks);

  // Listen for bookmark events from other components
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.text) return;
      const newItem: BookmarkItem = {
        id: `bm_${Date.now()}`,
        text: detail.text.slice(0, 500),
        source: detail.source || 'bookmark',
        timestamp: Date.now(),
      };
      setItems(prev => {
        const next = [newItem, ...prev.filter(i => i.text !== newItem.text)].slice(0, 20);
        saveBookmarks(next);
        return next;
      });
    };
    window.addEventListener('runecode:bookmark', handler);
    return () => window.removeEventListener('runecode:bookmark', handler);
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleRemove = (id: string) => {
    setItems(prev => {
      const next = prev.filter(i => i.id !== id);
      saveBookmarks(next);
      return next;
    });
  };

  if (items.length === 0) return null;

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        <Bookmark className="h-3 w-3 text-muted-foreground/60" />
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Bookmarks</h3>
        <span className="ml-auto text-[9px] text-muted-foreground/40">{items.length}</span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="py-1 space-y-0.5 max-h-[200px] overflow-y-auto">
              {items.map(item => (
                <div key={item.id} className="group flex items-start gap-1 px-1 py-1 rounded hover:bg-muted/30 transition-colors text-[10px]">
                  {item.source === 'clipboard' ? (
                    <Clipboard className="h-2.5 w-2.5 text-blue-400/40 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Bookmark className="h-2.5 w-2.5 text-amber-400/40 mt-0.5 flex-shrink-0" />
                  )}
                  <span className="flex-1 line-clamp-2 break-words" style={{ color: 'var(--color-text-secondary)' }}>
                    {item.text}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => handleCopy(item.text)} className="p-0.5 hover:bg-muted/50 rounded" title="Copy" aria-label="Copy bookmark">
                      <Copy className="h-2.5 w-2.5 text-muted-foreground/40" />
                    </button>
                    <button onClick={() => handleRemove(item.id)} className="p-0.5 hover:bg-muted/50 rounded" title="Remove" aria-label="Remove bookmark">
                      <X className="h-2.5 w-2.5 text-muted-foreground/40" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
