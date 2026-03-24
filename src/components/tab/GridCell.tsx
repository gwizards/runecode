import React from 'react';

/**
 * Grid cell wrapper that detects when embedded content (terminals, iframes)
 * receives focus via click. Terminals and iframes swallow mouse events,
 * so we poll for focus changes while the mouse hovers over the cell.
 */
export function GridCell({ tabId, isFocused, switchToTab, children, ...props }: {
  tabId: string;
  isFocused: boolean;
  switchToTab: (id: string) => void;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const hoveringRef = React.useRef(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const switchRef = React.useRef(switchToTab);
  switchRef.current = switchToTab;
  const tabIdRef = React.useRef(tabId);
  tabIdRef.current = tabId;
  const isFocusedRef = React.useRef(isFocused);
  isFocusedRef.current = isFocused;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const checkFocus = () => {
      // If already focused, nothing to do
      if (isFocusedRef.current) return;
      // Check if any focused element (iframe, xterm canvas, etc.) is inside this cell
      const active = document.activeElement;
      if (active && active !== document.body && el.contains(active)) {
        switchRef.current(tabIdRef.current);
      }
    };

    const startPoll = () => {
      hoveringRef.current = true;
      if (!pollRef.current) {
        pollRef.current = setInterval(checkFocus, 80);
      }
    };
    const stopPoll = () => {
      hoveringRef.current = false;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };

    // Also catch initial focus steal via window.blur
    const handleBlur = () => {
      if (hoveringRef.current) setTimeout(checkFocus, 0);
    };

    el.addEventListener('mouseenter', startPoll);
    el.addEventListener('mouseleave', stopPoll);
    window.addEventListener('blur', handleBlur);

    return () => {
      el.removeEventListener('mouseenter', startPoll);
      el.removeEventListener('mouseleave', stopPoll);
      window.removeEventListener('blur', handleBlur);
      stopPoll();
    };
  }, []);

  return <div ref={ref} {...props}>{children}</div>;
}
