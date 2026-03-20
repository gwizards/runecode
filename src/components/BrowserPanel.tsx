import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Globe, ExternalLink, RotateCw, Pencil, Check, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabContext } from '@/contexts/TabContext';

const LS_KEY = 'runecode-browser-url';

/** Detect if running inside Tauri (real desktop, not web mock) */
function isTauri(): boolean {
  return !!(window as any).__TAURI__ && !(window as any).__TAURI_INTERNALS__?.__WEB_MODE_MOCK__;
}

function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]';
  } catch { return false; }
}

interface BrowserPanelProps {
  tabId: string;
  initialUrl?: string;
  projectName?: string;
  onActivate?: () => void;
}

export function BrowserPanel({ tabId, initialUrl, projectName, onActivate }: BrowserPanelProps) {
  const savedUrl = initialUrl || localStorage.getItem(LS_KEY) || '';
  const [url, setUrl] = useState(savedUrl);
  const [inputValue, setInputValue] = useState(savedUrl);
  const [isEditing, setIsEditing] = useState(!savedUrl);
  const [iframeKey, setIframeKey] = useState(0);
  const [webviewId, setWebviewId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const { updateTab } = useTabContext();

  const isExternal = url ? !isLocalUrl(url) : false;
  const useTauriWebview = isTauri() && isExternal;

  const iframeSrc = useMemo(() => url || '', [url]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (url) {
      try {
        const hostname = new URL(url).hostname;
        const base = hostname || 'Browser';
        updateTab(tabId, { title: projectName ? `🌐 ${projectName}` : base });
      } catch {
        updateTab(tabId, { title: projectName ? `🌐 ${projectName}` : 'Browser' });
      }
    }
  }, [url, tabId, updateTab, projectName]);

  // Tauri webview management
  useEffect(() => {
    if (!useTauriWebview || !url) return;

    let wvId: string | null = null;

    (async () => {
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const id = `browser-${tabId.replace(/[^a-z0-9]/gi, '')}`;
        wvId = id;

        // Create a Tauri webview window
        const wv = new WebviewWindow(id, {
          url,
          title: `RuneCode Browser: ${url}`,
          width: 1024,
          height: 768,
          decorations: true,
          center: true,
          focus: true,
        });

        wv.once('tauri://error', (e) => {
          console.error('[browser] Tauri webview error:', e);
          setWebviewId(null);
        });

        wv.once('tauri://created', () => {
          setWebviewId(id);
        });

        wv.once('tauri://destroyed', () => {
          setWebviewId(null);
        });
      } catch (err) {
        console.error('[browser] Failed to create Tauri webview:', err);
      }
    })();

    return () => {
      // Clean up webview on unmount
      if (wvId) {
        (async () => {
          try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const wv = await WebviewWindow.getByLabel(wvId!);
            if (wv) await wv.close();
          } catch {}
        })();
      }
    };
  }, [useTauriWebview, url, tabId]);

  // Listen for external navigation requests
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const newUrl = e.detail?.url;
      if (!newUrl) return;
      setUrl(newUrl);
      setInputValue(newUrl);
      setIsEditing(false);
      setIframeKey(k => k + 1);
    };
    window.addEventListener('runecode:browser-navigate', handler as EventListener);
    return () => window.removeEventListener('runecode:browser-navigate', handler as EventListener);
  }, []);

  const handleSubmit = useCallback(() => {
    let normalizedUrl = inputValue.trim();
    if (!normalizedUrl) return;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/i.test(normalizedUrl);
      normalizedUrl = (isLocal ? 'http://' : 'https://') + normalizedUrl;
    }
    setUrl(normalizedUrl);
    setInputValue(normalizedUrl);
    setIsEditing(false);
    localStorage.setItem(LS_KEY, normalizedUrl);
    updateTab(tabId, { browserUrl: normalizedUrl });
  }, [inputValue, tabId, updateTab]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    else if (e.key === 'Escape' && url) {
      setInputValue(url);
      setIsEditing(false);
    }
  }, [handleSubmit, url]);

  if (!url && !isEditing) setIsEditing(true);

  if (!url) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Globe className="w-8 h-8 text-purple-400/60" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Project Browser</h2>
            <p className="text-sm text-muted-foreground">Enter your project's website URL to preview it here</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full max-w-lg">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="http://localhost:3000"
            className="flex-1 px-3 py-2 rounded-lg border border-border/50 bg-background text-sm font-mono focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              inputValue.trim()
                ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30"
                : "bg-muted/30 text-muted-foreground/40 cursor-not-allowed"
            )}
          >
            Open
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground/40 max-w-lg text-center">
          Common URLs: <code className="bg-muted px-1 rounded">localhost:3000</code>, <code className="bg-muted px-1 rounded">localhost:5173</code>, <code className="bg-muted px-1 rounded">localhost:8080</code>
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/30 bg-background/80 flex-shrink-0">
        <button
          onClick={() => {
            if (useTauriWebview && webviewId) {
              // Reload Tauri webview by recreating
              setIframeKey(k => k + 1);
            } else {
              setIframeKey(k => k + 1);
            }
          }}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Reload"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>

        {isEditing ? (
          <div className="flex-1 flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-2 py-1 rounded-md border border-border/50 bg-muted/30 text-xs font-mono focus:border-purple-500/50 focus:outline-none"
            />
            <button onClick={handleSubmit} disabled={!inputValue.trim()} className="p-1 rounded-md hover:bg-emerald-500/20 text-emerald-400 transition-colors" title="Go">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setInputValue(url); setIsEditing(false); }} className="p-1 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors" title="Cancel">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="flex-1 flex items-center gap-2 px-2 py-1 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors group text-left"
            title="Click to change URL"
          >
            <Globe className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            <span className="text-xs font-mono text-muted-foreground truncate flex-1">{url}</span>
            <Pencil className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 flex-shrink-0" />
          </button>
        )}

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          title="Open in external browser"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* External site warning — web mode only */}
      {isExternal && !isTauri() && (
        <div className="px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/15 text-[10px] text-amber-400/60 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>External sites may block embedding in web mode.</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary/60 hover:text-primary underline flex items-center gap-0.5">
            Open in browser <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      )}

      {/* Tauri webview indicator */}
      {useTauriWebview && webviewId && (
        <div className="px-3 py-1.5 bg-emerald-500/5 border-b border-emerald-500/15 text-[10px] text-emerald-400/60 flex items-center gap-2">
          <span>Opened in native browser window (no iframe restrictions)</span>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 min-h-0" onMouseDown={onActivate}>
        {useTauriWebview ? (
          // Tauri: show placeholder — the actual browser is in a native window
          <div ref={webviewContainerRef} className="h-full flex items-center justify-center text-muted-foreground/30">
            <div className="text-center space-y-2">
              <Globe className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-xs">{webviewId ? 'Site opened in native window' : 'Opening native browser...'}</p>
              <p className="text-[10px] text-muted-foreground/20">{url}</p>
            </div>
          </div>
        ) : (
          // Web mode: iframe (works for localhost, may be blocked for external)
          <IframeWithActivation
            key={iframeKey}
            src={iframeSrc}
            onActivate={onActivate}
          />
        )}
      </div>
    </div>
  );
}

/** Iframe wrapper that detects clicks inside the iframe for grid cell activation */
function IframeWithActivation({ src, onActivate }: { src: string; onActivate?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  useEffect(() => {
    if (!onActivateRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    let pollId: ReturnType<typeof setInterval> | null = null;
    let hovering = false;

    const isIframeFocused = () =>
      document.activeElement?.tagName === 'IFRAME' &&
      container.contains(document.activeElement);

    const handleBlur = () => {
      setTimeout(() => {
        if (isIframeFocused()) onActivateRef.current?.();
      }, 0);
    };

    const startPolling = () => {
      if (pollId) return;
      hovering = true;
      pollId = setInterval(() => {
        if (!hovering) { stopPolling(); return; }
        if (isIframeFocused()) onActivateRef.current?.();
      }, 100);
    };

    const stopPolling = () => {
      if (pollId) { clearInterval(pollId); pollId = null; }
    };

    const handleMouseEnter = () => { hovering = true; startPolling(); };
    const handleMouseLeave = () => { hovering = false; stopPolling(); };

    window.addEventListener('blur', handleBlur);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('blur', handleBlur);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      stopPolling();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <iframe
        src={src}
        className="w-full h-full border-0"
        title="Project Browser"
      />
    </div>
  );
}
