import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface EmbeddedTerminalProps {
  /** Claude session ID to resume (optional) */
  sessionId?: string;
  /** Project working directory */
  projectPath?: string;
  /** Extra CLI flags (e.g., --dangerously-skip-permissions) */
  flags?: string[];
  /** Called when the process exits */
  onExit?: () => void;
  /** Extra CSS classes */
  className?: string;
}

export function EmbeddedTerminal({
  sessionId,
  projectPath,
  flags,
  onExit,
  className = '',
}: EmbeddedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
    fitAddon.fit();
    termRef.current = term;

    // Build WebSocket URL with query params
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    if (sessionId) params.set('sessionId', sessionId);
    if (projectPath) params.set('projectPath', projectPath);
    if (flags && flags.length > 0) params.set('flags', flags.join(','));
    params.set('cols', String(term.cols));
    params.set('rows', String(term.rows));
    const url = `${protocol}//${window.location.host}/ws/terminal?${params}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln('\x1b[90m— Connected to Claude CLI —\x1b[0m\r\n');
    };

    ws.onmessage = (event) => {
      // Handle binary or string data
      if (typeof event.data === 'string') {
        // Check if it's a JSON control message
        if (event.data.startsWith('{')) {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'terminal_started') {
              // Acknowledgement — no visible output needed
              return;
            }
          } catch { /* not JSON, write as terminal output */ }
        }
        term.write(event.data);
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then(buf => {
          term.write(new Uint8Array(buf));
        });
      }
    };

    ws.onclose = () => {
      term.writeln('\r\n\x1b[90m— Disconnected —\x1b[0m');
      onExit?.();
    };

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m— Connection error —\x1b[0m');
    };

    // Send keystrokes to backend
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Resize on container resize
    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        // Notify backend of new dimensions
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      } catch { /* ignore */ }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, [sessionId, projectPath]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-hidden ${className}`}
      style={{ background: '#0a0a0f' }}
    />
  );
}
