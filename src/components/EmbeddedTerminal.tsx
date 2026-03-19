import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface EmbeddedTerminalProps {
  sessionId?: string;
  projectPath?: string;
  flags?: string[];
  tabId?: string;
  onExit?: () => void;
  className?: string;
}

export function EmbeddedTerminal({
  sessionId,
  projectPath,
  flags,
  tabId,
  onExit,
  className = '',
}: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

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
      if (detail?.tabId && tabId && detail.tabId !== tabId) return;
      term.focus();
    };
    window.addEventListener('runecode:focus-prompt', handleFocus);

    // Delay WebSocket connection until layout is settled (double-rAF)
    // so cols/rows reflect the actual container size
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fitAddon.fit();

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (projectPath) params.set('projectPath', projectPath);
      if (flags && flags.length > 0) params.set('flags', flags.join(','));
      params.set('cols', String(term.cols));
      params.set('rows', String(term.rows));

      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?${params}`);
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
        onExit?.();
      };

      ws.onerror = () => {
        term.writeln('\r\n\x1b[31m— Connection error —\x1b[0m');
      };

      term.focus();
    }));

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('runecode:focus-prompt', handleFocus);
      ro.disconnect();
      roRef.current = null;
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId, projectPath, flags]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-hidden ${className}`}
      style={{ background: '#0a0a0f', minWidth: 0 }}
    />
  );
}
