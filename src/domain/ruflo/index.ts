export * from './types';
export * from './events';
export * from './service';
export { useRuFloStore, setRuFloEventListener, teardownRuFloListeners, getLocalMemoryStore, upgradeMemoryStoreMode } from './store';
export * from './quantization';
export { QuantizedMemoryStore, createRuFloMemoryStore } from './memory-store';
export type { QuantizedEntry, SearchResult, QuantizedMemoryStoreConfig } from './memory-store';

// DDD v9 additions — domain-events re-exported via events.ts barrel
export * from './aggregates';

// Browser-event bridge — infrastructure adapters exposed through the public barrel
// so UI components can import from '@/domain/ruflo' without knowing the infra path.
export {
  RUFLO_EVENTS,
  dispatchRuFloEvent,
  onRuFloEvent,
} from '../../infrastructure/ruflo/browser-events-bridge';
export type {
  RuFloEventName,
  RuFloStatusChangedPayload,
  RuFloMemoryChangedPayload,
  RuFloProjectChangedPayload,
} from '../../infrastructure/ruflo/browser-events-bridge';

// Value Objects
export { SwarmTopology } from './value-objects/swarm-topology';
export type { SwarmTopologyValue } from './value-objects/swarm-topology';
export { MemoryBackend } from './value-objects/memory-backend';
export type { MemoryBackendValue } from './value-objects/memory-backend';
