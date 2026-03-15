import { useState, useEffect } from 'react';
import { createHighlighter, type Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;
let cachedHighlighter: Highlighter | null = null;

const PRELOAD_LANGUAGES = [
  'javascript', 'typescript', 'tsx', 'jsx', 'json', 'html', 'css',
  'python', 'rust', 'bash', 'shell', 'markdown', 'yaml', 'toml', 'sql'
];

function getHighlighter(): Promise<Highlighter> {
  if (cachedHighlighter) return Promise.resolve(cachedHighlighter);
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: PRELOAD_LANGUAGES,
    }).then(h => {
      cachedHighlighter = h;
      return h;
    });
  }
  return highlighterPromise;
}

export function useShiki() {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(cachedHighlighter);

  useEffect(() => {
    if (cachedHighlighter) {
      setHighlighter(cachedHighlighter);
      return;
    }
    getHighlighter().then(setHighlighter);
  }, []);

  return highlighter;
}

export function highlightCode(highlighter: Highlighter, code: string, lang: string, theme: string = 'github-dark'): string {
  try {
    const loadedLangs = highlighter.getLoadedLanguages();
    const actualLang = loadedLangs.includes(lang as any) ? lang : 'text';
    return highlighter.codeToHtml(code, { lang: actualLang, theme });
  } catch {
    // Fallback: return escaped HTML
    return `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
  }
}
