/** Inline code block with a copy button — used in web-mode manual instruction steps. */
export function CopyBlock({ code }: { code: string }) {
  return (
    <div className="flex items-start gap-1.5 bg-black/30 rounded-lg px-3 py-2 font-mono text-[11px] text-purple-300/80">
      <span className="flex-1 whitespace-pre-wrap break-all select-all leading-relaxed">{code}</span>
      <button
        onClick={() => navigator.clipboard.writeText(code).catch(() => { /* clipboard may fail when unfocused */ })}
        aria-label="Copy command"
        className="text-white/50 hover:text-white/70 transition-colors flex-shrink-0 text-[10px] px-2 py-0.5 rounded border border-white/10 hover:border-white/20 mt-0.5"
      >
        Copy
      </button>
    </div>
  );
}
