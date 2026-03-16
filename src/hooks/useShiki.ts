import { useState, useEffect } from 'react';
import { createHighlighter, type Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;
let cachedHighlighter: Highlighter | null = null;

// Only preload the most common languages to reduce initial bundle/parse time.
// Other languages are loaded on-demand when first encountered.
const PRELOAD_LANGUAGES = [
  'typescript', 'javascript', 'json', 'bash',
];

// Track in-flight language loads to avoid duplicate requests
const pendingLangLoads = new Map<string, Promise<void>>();

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

/**
 * Load a language grammar on-demand if not already loaded.
 * Returns true if the language is available after loading.
 */
async function ensureLanguageLoaded(highlighter: Highlighter, lang: string): Promise<boolean> {
  const loadedLangs = highlighter.getLoadedLanguages();
  if (loadedLangs.includes(lang as any)) return true;

  // Check if already loading
  if (pendingLangLoads.has(lang)) {
    await pendingLangLoads.get(lang);
    return highlighter.getLoadedLanguages().includes(lang as any);
  }

  // Attempt to load the language
  const loadPromise = highlighter.loadLanguage(lang as any)
    .then(() => { pendingLangLoads.delete(lang); })
    .catch(() => { pendingLangLoads.delete(lang); });
  pendingLangLoads.set(lang, loadPromise);
  await loadPromise;

  return highlighter.getLoadedLanguages().includes(lang as any);
}

export function useShiki() {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(cachedHighlighter);

  useEffect(() => {
    let cancelled = false;
    if (cachedHighlighter) {
      setHighlighter(cachedHighlighter);
      return;
    }
    getHighlighter().then(h => {
      if (!cancelled) setHighlighter(h);
    });
    return () => { cancelled = true; };
  }, []);

  return highlighter;
}

export function highlightCode(highlighter: Highlighter, code: string, lang: string, theme: string = 'github-dark'): string {
  try {
    const loadedLangs = highlighter.getLoadedLanguages();
    const isLoaded = loadedLangs.includes(lang as any);
    const actualLang = isLoaded ? lang : 'text';

    // Trigger on-demand load for next render if language is missing
    if (!isLoaded && lang !== 'text') {
      ensureLanguageLoaded(highlighter, lang);
    }

    return highlighter.codeToHtml(code, { lang: actualLang, theme });
  } catch {
    // Fallback: return escaped HTML
    return `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
  }
}

export { ensureLanguageLoaded };
