import { useEffect, useCallback } from 'react';
import { useAgentDomainStore } from '../domain/agent/store';
// TODO: migrate to domain store — `addLiveAgent` and `updateLiveAgent` do not exist on
//       domain AgentDomainState. The domain store uses `startAgent(id, name)`,
//       `completeAgent(id)`, and `failAgent(id, reason)` instead. Callers below are cast
//       to `any` until this hook is rewritten against the domain API.
import { useTabState } from './useTabState';

export function useAgentLifecycle() {
  const { createAgentTab } = useTabState();

  const handleEvent = useCallback((event: any) => {
    const payload = event.detail || event.payload;
    if (!payload) return;

    // TODO: migrate to domain store — use `useAgentDomainStore.getState().startAgent`,
    //       `.completeAgent`, `.failAgent` once this hook is rewritten against the domain API.
    //       `addLiveAgent` and `updateLiveAgent` are legacy actions not present in the domain store.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = useAgentDomainStore.getState() as any;
    const { event: eventType, agent_id, agent_name } = payload;

    if (eventType === 'started') {
      store.addLiveAgent?.({
        id: agent_id,
        name: agent_name || 'Agent',
        status: 'running',
        startedAt: Date.now(),
        elapsedMs: 0,
        tokenCount: 0,
      });
      // Auto-create a tab for the new agent
      createAgentTab(agent_id, agent_name || 'Agent');
    } else if (eventType === 'completed') {
      store.updateLiveAgent?.(agent_id, { status: 'completed' });
    } else if (eventType === 'failed') {
      store.updateLiveAgent?.(agent_id, { status: 'failed' });
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
