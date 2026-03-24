import type { QuantizationMode, QuantizedMemoryStore } from '../memory-store';

/**
 * Port: abstracts localStorage persistence for the ruflo bounded context.
 * The concrete adapter lives in src/infrastructure/persistence/ruflo-persistence.ts
 */
export interface IRuFloLocalPersistencePort {
  /** Load the persisted quantization mode, falling back to 'scalar'. */
  loadPersistedMode(): QuantizationMode;
  /** Persist the current quantization mode. */
  savePersistedMode(mode: QuantizationMode): void;
  /** Persist the calibration data from a QuantizedMemoryStore. */
  saveCalibration(store: QuantizedMemoryStore): void;
  /** Restore calibration data into a QuantizedMemoryStore from localStorage. */
  restoreCalibration(store: QuantizedMemoryStore): void;
  /**
   * Returns true if the agentdb backend has already been initialized on a
   * previous page load, and marks it as initialized if not.
   */
  checkAndMarkBackendInitialized(): boolean;
}
