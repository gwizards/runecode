export * from './types';
export * from './events';
export * from './service';
export { useRuFloStore, setRuFloEventListener, teardownRuFloListeners, getLocalMemoryStore, upgradeMemoryStoreMode } from './store';
export * from './quantization';
export { QuantizedMemoryStore, createRuFloMemoryStore } from './memory-store';
export type { QuantizationMode, QuantizedEntry, SearchResult, QuantizedMemoryStoreConfig } from './memory-store';

// DDD v9 additions — domain-events re-exported via events.ts barrel
export * from './aggregates';


// Value Objects
export { SwarmTopology } from './value-objects/swarm-topology';
export type { SwarmTopologyValue } from './value-objects/swarm-topology';
export { MemoryBackend } from './value-objects/memory-backend';
export type { MemoryBackendValue } from './value-objects/memory-backend';
