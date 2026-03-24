import type { RawLedger } from '../types';

/**
 * Port: abstracts SQLite persistence for the usage bounded context.
 * The concrete adapter (TauriUsagePersistenceAdapter) lives in
 * src/infrastructure/tauri/usage-client.ts
 */
export interface IUsagePersistencePort {
  persist(snapshot: RawLedger, totalCostMicroUsd: number): Promise<void>;
  loadAll(): Promise<Array<{
    id: string;
    projectId: string;
    sessionId: string | null;
    recordsJson: string;
    totalCostMicroUsd: number;
    createdAt: number;
    updatedAt: number;
  }>>;
}
