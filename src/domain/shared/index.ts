export { DomainEventBus, globalEventBus } from './event-bus';
export type { DomainEvent, EventHandler } from './event-bus';

export { ProjectId } from './project-id';

export { Ok, Err, unwrap, mapResult, mapErr, flatMap, tryResult } from './result';
export type { Result } from './result';

export { createInMemoryRepository } from './repository';
export type { IRepository, IReadRepository, IWriteRepository } from './repository';

export {
  quantizeScalar,
  dequantizeScalar,
  deriveUint32Params,
  quantizeVector,
  dequantizeVector,
  int8CosineSimilarity,
  ScalarQuantizer,
  AgentSnapshotQuantizer,
  MCPSnapshotQuantizer,
  ProjectSnapshotQuantizer,
  QuantizedSnapshotStore,
  QuantizedVectorStore,
  computeSavingsProjections,
} from './quantization';
export type {
  QuantizedBuffer,
  FieldQuantParams,
  QuantizedEntry,
  SavingsProjection,
} from './quantization';
