import { useState, useRef, useCallback, useEffect } from 'react';

const LS_KEY = 'runecode-ai-autocomplete-enabled';
const LS_ENDPOINT_KEY = 'runecode-ai-autocomplete-endpoint';
const LS_PROVIDER_KEY = 'runecode-ai-autocomplete-provider';
const DEFAULT_ENDPOINT = '/api/autocomplete';
const DEBOUNCE_MS = 500; // 500ms debounce — wait for user to pause before triggering
const MIN_CHARS = 5; // need more context for a meaningful completion

export type AutocompleteProvider = 'haiku' | 'local';

export interface AutocompleteConfig {
  enabled: boolean;
  endpoint: string;
  provider: AutocompleteProvider;
}

export function getAutocompleteConfig(): AutocompleteConfig {
  try {
    const provider = (localStorage.getItem(LS_PROVIDER_KEY) as AutocompleteProvider) || 'haiku';
    return {
      enabled: localStorage.getItem(LS_KEY) !== 'false',
      endpoint: provider === 'local'
        ? (localStorage.getItem(LS_ENDPOINT_KEY) || 'http://localhost:11434/v1/completions')
        : DEFAULT_ENDPOINT,
      provider,
    };
  } catch {
    return { enabled: false, endpoint: DEFAULT_ENDPOINT, provider: 'haiku' };
  }
}

export function setAutocompleteConfig(config: Partial<AutocompleteConfig>) {
  try {
    if (config.enabled !== undefined) localStorage.setItem(LS_KEY, String(config.enabled));
    if (config.endpoint !== undefined) localStorage.setItem(LS_ENDPOINT_KEY, config.endpoint);
    if (config.provider !== undefined) localStorage.setItem(LS_PROVIDER_KEY, config.provider);
  } catch { /* ignore */ }
  window.dispatchEvent(new Event('runecode-settings-changed'));

  // Sync local-provider flag to backend for auto-start on next launch
  const currentConfig = getAutocompleteConfig();
  const shouldAutoStart = (config.enabled ?? currentConfig.enabled)
    && (config.provider ?? currentConfig.provider) === 'local';
  fetch('/api/local-model/auto-start-flag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: shouldAutoStart }),
  }).catch(() => {});

  // Auto-start/stop local server based on config change
  if (shouldAutoStart) {
    fetch('/api/local-model/start', { method: 'POST' }).catch(() => {});
  }
}

/**
 * Hook that provides AI-powered ghost text autocomplete for the prompt input.
 * Uses Qwen3-Coder via an OpenAI-compatible local endpoint (Ollama/vLLM).
 */
export function useAiAutocomplete(opts: {
  /** Current text in the textarea */
  text: string;
  /** Cursor position in the text */
  cursorPos: number;
  /** Recent conversation messages for context */
  conversationContext?: string;
  /** Project path for additional context */
  projectPath?: string;
  /** Available slash commands for / completion */
  availableCommands?: string;
}) {
  const { text, cursorPos, conversationContext, projectPath, availableCommands } = opts;

  const [ghostText, setGhostText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestText = useRef('');

  // Read config reactively
  const [config, setConfig] = useState(getAutocompleteConfig);
  useEffect(() => {
    const handler = () => setConfig(getAutocompleteConfig());
    window.addEventListener('runecode-settings-changed', handler);
    return () => window.removeEventListener('runecode-settings-changed', handler);
  }, []);

  // Clear ghost text when text changes
  useEffect(() => {
    setGhostText('');
  }, [text]);

  // Fetch completion with debounce
  const fetchCompletion = useCallback(async () => {
    if (!config.enabled) return;

    const textBeforeCursor = text.slice(0, cursorPos);
    const textAfterCursor = text.slice(cursorPos);

    // Don't trigger on very short input or whitespace-only
    if (textBeforeCursor.trim().length < MIN_CHARS) return;

    // Don't re-request for the same text
    if (textBeforeCursor === lastRequestText.current) return;
    lastRequestText.current = textBeforeCursor;

    // Abort previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);

    try {
      let response: Response;

      if (config.provider === 'haiku' || config.provider === 'local') {
        // Built-in endpoint — routes to Haiku or local model based on provider
        response = await fetch('/api/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            prefix: textBeforeCursor,
            suffix: textAfterCursor || undefined,
            projectPath,
            provider: config.provider,
            conversationContext: conversationContext?.slice(-500),
            availableCommands: textBeforeCursor.startsWith('/') ? availableCommands : undefined,
          }),
        });
      } else {
        // External OpenAI-compatible endpoint (custom)
        const contextLines: string[] = [];
        if (projectPath) contextLines.push(`# Project: ${projectPath}`);
        if (conversationContext) {
          const trimmed = conversationContext.length > 500
            ? '...' + conversationContext.slice(-500)
            : conversationContext;
          contextLines.push(`# Recent conversation:\n${trimmed}`);
        }
        contextLines.push(`# User is typing a message/command:`);

        response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'qwen3-coder',
            prompt: contextLines.join('\n') + '\n' + textBeforeCursor,
            suffix: textAfterCursor || undefined,
            max_tokens: 60,
            temperature: 0.2,
            stop: ['\n\n', '\n#', '```'],
            stream: false,
          }),
        });
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const completion = data.choices?.[0]?.text || '';

      // Only show non-empty, non-whitespace completions
      if (completion.trim() && !controller.signal.aborted) {
        setGhostText(completion);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        // Silently fail — autocomplete is a nice-to-have
        console.debug('[autocomplete] Request failed:', err.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [text, cursorPos, config.enabled, config.endpoint, conversationContext, projectPath]);

  // Debounced trigger
  useEffect(() => {
    if (!config.enabled || text.trim().length < MIN_CHARS) {
      setGhostText('');
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchCompletion, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, cursorPos, config.enabled, fetchCompletion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  /** Accept the ghost text — append it to the current text */
  const acceptGhostText = useCallback((): string | null => {
    if (!ghostText) return null;
    const accepted = ghostText;
    setGhostText('');
    lastRequestText.current = '';
    return accepted;
  }, [ghostText]);

  /** Dismiss the ghost text */
  const dismissGhostText = useCallback(() => {
    setGhostText('');
    lastRequestText.current = '';
  }, []);

  return {
    ghostText,
    isLoading,
    acceptGhostText,
    dismissGhostText,
    enabled: config.enabled,
  };
}
