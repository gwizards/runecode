import { useEffect } from 'react';
import { useAgentStore } from '../stores/agentStore';

export function useAgentLifecycle() {
  useEffect(() => {
    // Listen for agent lifecycle events (Tauri or DOM events)
    const handleEvent = (event: any) => {
      const payload = event.detail || event.payload;
      if (!payload) return;

      const store = useAgentStore.getState();
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
      } else if (eventType === 'completed') {
        store.updateLiveAgent(agent_id, { status: 'completed' });
      } else if (eventType === 'failed') {
        store.updateLiveAgent(agent_id, { status: 'failed' });
      }
    };

    // Listen on DOM events (web mode fallback)
    window.addEventListener('agent-lifecycle', handleEvent);

    // Try Tauri listen
    let unlisten: (() => void) | null = null;
    if ((window as any).__TAURI__) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('agent-lifecycle', handleEvent).then(fn => { unlisten = fn; });
      });
    }

    return () => {
      window.removeEventListener('agent-lifecycle', handleEvent);
      if (unlisten) unlisten();
    };
  }, []);
}
