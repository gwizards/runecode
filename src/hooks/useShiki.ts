import { useState, useEffect } from 'react';
import { createHighlighter, type Highlighter } from 'shiki';

const SAFE_LANGUAGES = new Set([
  'typescript', 'javascript', 'tsx', 'jsx', 'python', 'rust', 'go',
  'java', 'c', 'cpp', 'csharp', 'html', 'css', 'json', 'yaml', 'toml',
  'bash', 'sh', 'shell', 'markdown', 'md', 'sql', 'graphql', 'xml',
  'dockerfile', 'makefile', 'text', 'plain', 'txt', 'diff', 'ini', 'env',
]);

function sanitizeLang(lang: string | undefined): string {
  const normalized = (lang ?? 'text').toLowerCase().trim();
  return SAFE_LANGUAGES.has(normalized) ? normalized : 'text';
}

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
  const safeLang = sanitizeLang(lang);
  const loadedLangs = highlighter.getLoadedLanguages();
  if (loadedLangs.includes(safeLang as any)) return true;

  // Check if already loading
  if (pendingLangLoads.has(safeLang)) {
    await pendingLangLoads.get(safeLang);
    return highlighter.getLoadedLanguages().includes(safeLang as any);
  }

  // Attempt to load the language
  const loadPromise = highlighter.loadLanguage(safeLang as any)
    .then(() => { pendingLangLoads.delete(safeLang); })
    .catch(() => { pendingLangLoads.delete(safeLang); });
  pendingLangLoads.set(safeLang, loadPromise);
  await loadPromise;

  return highlighter.getLoadedLanguages().includes(safeLang as any);
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
    }).catch(console.warn);
    return () => { cancelled = true; };
  }, []);

  return highlighter;
}

export function highlightCode(highlighter: Highlighter, code: string, lang: string, theme: string = 'github-dark'): string {
  try {
    const safeLang = sanitizeLang(lang);
    const loadedLangs = highlighter.getLoadedLanguages();
    const isLoaded = loadedLangs.includes(safeLang as any);
    const actualLang = isLoaded ? safeLang : 'text';

    // Trigger on-demand load for next render if language is missing
    if (!isLoaded && safeLang !== 'text') {
      ensureLanguageLoaded(highlighter, safeLang);
    }

    return highlighter.codeToHtml(code, { lang: actualLang, theme });
  } catch {
    // Fallback: return escaped HTML
    return `<pre><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</code></pre>`;
  }
}

export { ensureLanguageLoaded };
