import { useEffect, useCallback } from 'react';
import { useAgentDomainStore } from '../domain/agent/store';
import { useTabState } from './useTabState';

export function useAgentLifecycle() {
  const { createAgentTab } = useTabState();

  const handleEvent = useCallback((event: any) => {
    const payload = event.detail || event.payload;
    if (!payload) return;

    const store = useAgentDomainStore.getState();
    const { event: eventType, agent_id, agent_name } = payload;

    if (eventType === 'started') {
      store.addLiveAgent({
        id: agent_id,
        name: agent_name || 'Agent',
        status: 'running',
        startedAt: Date.now(),
        elapsedMs: 0,
        tokenCount: 0,
      });
      // Also register in the domain aggregate so lifecycle actions work
      store.startAgent(agent_id, agent_name || 'Agent');
      // Auto-create a tab for the new agent
      createAgentTab(agent_id, agent_name || 'Agent');
    } else if (eventType === 'completed') {
      store.updateLiveAgent(agent_id, { status: 'completed' });
      store.completeAgent(agent_id);
    } else if (eventType === 'failed') {
      store.updateLiveAgent(agent_id, { status: 'failed' });
      store.failAgent(agent_id, payload.reason || 'Agent failed');
    }
  }, [createAgentTab]);

  useEffect(() => {
    let isCancelled = false;
    let unlisten: (() => void) | null = null;

    // Listen on DOM events (web mode fallback)
    window.addEventListener('agent-lifecycle', handleEvent);

    // Try Tauri listen
    if (window.__TAURI_INTERNALS__ && !window.__TAURI_INTERNALS__.__WEB_MODE_MOCK__) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('agent-lifecycle', handleEvent).then(fn => {
          if (isCancelled) fn(); // cleanup immediately if already unmounted
          else unlisten = fn;
        });
      });
    }

    return () => {
      isCancelled = true;
      window.removeEventListener('agent-lifecycle', handleEvent);
      if (unlisten) unlisten();
    };
  }, [handleEvent]);
}
