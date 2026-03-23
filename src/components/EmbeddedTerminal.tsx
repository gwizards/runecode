import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface EmbeddedTerminalProps {
  sessionId?: string;
  projectPath?: string;
  flags?: string[];
  tabId?: string;
  /** Environment ID — null/undefined = local */
  environmentId?: string;
  onExit?: () => void;
  className?: string;
}

export function EmbeddedTerminal({
  sessionId,
  projectPath,
  flags,
  tabId,
  environmentId,
  onExit,
  className = '',
}: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  // Use refs for callback and identity props to avoid tearing down the terminal on every change
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const tabIdRef = useRef(tabId);
  tabIdRef.current = tabId;
  const environmentIdRef = useRef(environmentId);
  environmentIdRef.current = environmentId;

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
      cursorBlink: true,
      theme: {
        background: '#0a0a0f',
        foreground: '#e0e0e8',
        cursor: '#a78bfa',
        selectionBackground: '#a78bfa40',
        black: '#1a1a2e',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e0e0e8',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Clickable URLs — open in browser panel or external browser
    const webLinksAddon = new WebLinksAddon((_event, url) => {
      const openInBrowser = localStorage.getItem('runecode-terminal-links-in-browser') !== 'false';
      if (openInBrowser) {
        window.dispatchEvent(new CustomEvent('runecode:open-url-in-browser', { detail: { url } }));
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fitAddon;

    // Send keystrokes to backend via ref (works before and after WS connects)
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // Resize observer — debounced to avoid flooding backend during drag resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCols = term.cols;
    let lastRows = term.rows;
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { return; }
      // Only send resize if dimensions actually changed, debounced 150ms
      if (term.cols !== lastCols || term.rows !== lastRows) {
        lastCols = term.cols;
        lastRows = term.rows;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        }, 150);
      }
    });
    ro.observe(containerRef.current);
    roRef.current = ro;

    // Focus handler for Tab key cycling
    const handleFocus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tabId && tabIdRef.current && detail.tabId !== tabIdRef.current) return;
      term.focus();
    };
    window.addEventListener('runecode:focus-prompt', handleFocus);

    // Listen for "type text into terminal" events (e.g. from browser devtools)
    const handleTypeInTerminal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tabId && tabIdRef.current && detail.tabId !== tabIdRef.current) return;
      if (!detail?.text) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(detail.text);
      }
      term.focus();
    };
    window.addEventListener('runecode:type-in-terminal', handleTypeInTerminal);

    // Delay WebSocket connection until layout is settled (double-rAF)
    // so cols/rows reflect the actual container size.
    // `cancelled` is set by the cleanup function so that if React Strict Mode
    // (or a fast prop change) triggers cleanup before the rAF fires, we don't
    // open an orphaned WebSocket that can never be closed.
    let cancelled = false;
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      if (cancelled) return;
      fitAddon.fit();

      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (projectPath) params.set('projectPath', projectPath);
      if (flags && flags.length > 0) params.set('flags', flags.join(','));
      if (environmentIdRef.current) {
        params.set('environmentId', environmentIdRef.current);
        // Pass the full environment config so the backend can connect
        try {
          const stored = localStorage.getItem('runecode-remote-environments');
          if (stored) {
            const envs = JSON.parse(stored);
            const env = envs.find((e: any) => e.id === environmentIdRef.current);
            if (env) params.set('environment', JSON.stringify(env));
          }
        } catch {}
      }
      params.set('cols', String(term.cols));
      params.set('rows', String(term.rows));

      // In Tauri desktop mode, window.location is tauri://localhost/ — no port.
      // Retrieve the actual embedded terminal server port via IPC and build a
      // plain ws://127.0.0.1:<port>/ws/terminal URL instead.
      let wsHost = window.location.host;
      let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

      const isTauri = !!(
        (window as any).__TAURI__ ||
        (window as any).__TAURI_INTERNALS__ ||
        (window as any).__TAURI_METADATA__
      ) && !((window as any).__TAURI_INTERNALS__?.__WEB_MODE_MOCK__);

      if (isTauri) {
        wsProtocol = 'ws:'; // always plain WS for the local embedded server
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const port = await invoke<number>('get_terminal_port');
          if (port > 0) {
            wsHost = `127.0.0.1:${port}`;
          } else {
            term.writeln('\r\n\x1b[31m— Terminal server failed to start. Restart RuneCode. —\x1b[0m');
            return;
          }
        } catch {
          // fall through to window.location.host (web mode fallback)
        }
      }

      const wsUrl = `${wsProtocol}//${wsHost}/ws/terminal?${params}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer'; // Skip Blob conversion overhead
      wsRef.current = ws;

      ws.onopen = () => {
        term.writeln('\x1b[90m— Connected —\x1b[0m\r\n');
      };

      ws.onmessage = (event) => {
        // Fast path: binary data goes directly to xterm
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
          return;
        }
        // String data — write directly (skip JSON check for speed)
        term.write(event.data);
      };

      ws.onclose = () => {
        term.writeln('\r\n\x1b[90m— Disconnected —\x1b[0m');
        onExitRef.current?.();
      };

      ws.onerror = () => {
        term.writeln(`\r\n\x1b[31m— Connection error (${wsUrl}) —\x1b[0m`);
      };

      term.focus();
    }));

    return () => {
      cancelled = true; // prevent any in-flight rAF from opening a WebSocket
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('runecode:focus-prompt', handleFocus);
      window.removeEventListener('runecode:type-in-terminal', handleTypeInTerminal);
      ro.disconnect();
      roRef.current = null;
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  // Use flags.join(',') instead of the array reference so that a caller
  // passing an inline literal (e.g. flags={['--shell']}) does not cause
  // the terminal to reconnect on every parent render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, projectPath, flags?.join(',')]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-hidden ${className}`}
      style={{ background: '#0a0a0f', minWidth: 0 }}
    />
  );
}
