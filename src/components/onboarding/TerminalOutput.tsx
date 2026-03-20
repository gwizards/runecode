import { useEffect, useRef } from 'react';

interface TerminalOutputProps {
  lines: string[];
  maxHeight?: number;
}

export function TerminalOutput({ lines, maxHeight = 160 }: TerminalOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  if (lines.length === 0) return null;

  return (
    <div
      className="rounded-lg bg-black/40 border border-white/5 p-3 overflow-y-auto font-mono text-xs text-white/70 leading-relaxed"
      style={{ maxHeight }}
    >
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
