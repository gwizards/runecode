/**
 * Usage bounded context — Application Service.
 *
 * Orchestrates domain operations: load aggregate → call domain method →
 * persist → dispatch events → clear events → return Result.
 *
 * This layer is the only caller of IUsageLedgerRepository and DomainEventBus.
 * All public methods return Result<T> and never throw to callers.
 */

import type { DomainEventBus } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { toLedgerId, toSessionId, toProjectId, UsageLedger } from './types';
import type { RawUsageRecord, UsageSummary } from './types';
import type { IUsageLedgerRepository } from './repository';

export class UsageApplicationService {
  constructor(
    private readonly repo: IUsageLedgerRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Save aggregate, dispatch pending events, then clear them. */
  private async persist(ledger: UsageLedger): Promise<void> {
    await this.repo.save(ledger);
    this.eventBus.dispatch(ledger.events);
    ledger.clearEvents();
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  /**
   * Create and persist a new ledger in the open state.
   * Returns the new aggregate on success.
   */
  async openLedger(cmd: {
    id: string;
    sessionId: string;
    projectId: string;
  }): Promise<Result<UsageLedger>> {
    try {
      const ledger = UsageLedger.open(cmd);
      await this.persist(ledger);
      return Ok(ledger);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Append a usage record to the open ledger for the given session.
   * Fails if no open ledger exists for the session.
   */
  async recordUsage(cmd: {
    sessionId: string;
    record: RawUsageRecord;
  }): Promise<Result<UsageSummary>> {
    try {
      const sessionId = toSessionId(cmd.sessionId);
      const ledger    = await this.repo.getBySession(sessionId);
      if (!ledger) {
        return Err(`No open ledger found for session '${cmd.sessionId}'`);
      }
      const summary = ledger.addRecord(cmd.record);
      await this.persist(ledger);
      return Ok(summary);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Seal the open ledger for the given session.
   * Fails if no open ledger exists for the session.
   */
  async sealLedger(cmd: { sessionId: string }): Promise<Result<UsageSummary>> {
    try {
      const sessionId = toSessionId(cmd.sessionId);
      const ledger    = await this.repo.getBySession(sessionId);
      if (!ledger) {
        return Err(`No open ledger found for session '${cmd.sessionId}'`);
      }
      const summary = ledger.seal();
      await this.persist(ledger);
      return Ok(summary);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /**
   * Return the summary for the (open or sealed) ledger of a session.
   * Fails if no ledger exists for the session.
   */
  async getLedgerSummary(sessionId: string): Promise<Result<UsageSummary>> {
    try {
      const sid    = toSessionId(sessionId);
      const ledger = await this.repo.getBySession(sid);
      if (!ledger) {
        return Err(`No open ledger found for session '${sessionId}'`);
      }
      return Ok(ledger.summary());
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Query ledgers by optional projectId and/or date range.
   * Returns an array of summaries (may be empty).
   */
  async queryUsage(cmd: {
    projectId?: string;
    from?: number;
    to?: number;
  }): Promise<Result<UsageSummary[]>> {
    try {
      let ledgers: UsageLedger[];

      if (cmd.projectId !== undefined) {
        const projectId = toProjectId(cmd.projectId);
        ledgers         = await this.repo.listByProject(projectId);
        // Apply date range filter if provided
        if (cmd.from !== undefined || cmd.to !== undefined) {
          ledgers = ledgers.filter((l) => {
            if (cmd.from !== undefined && l.openedAt < cmd.from) return false;
            if (cmd.to   !== undefined && l.openedAt > cmd.to)   return false;
            return true;
          });
        }
      } else {
        ledgers = await this.repo.listByDateRange(cmd.from, cmd.to);
      }

      return Ok(ledgers.map((l) => l.summary()));
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Look up a ledger directly by its id and return its summary.
   * Fails if not found.
   */
  async getLedgerById(ledgerId: string): Promise<Result<UsageSummary>> {
    try {
      const lid    = toLedgerId(ledgerId);
      const ledger = await this.repo.getById(lid);
      if (!ledger) {
        return Err(`Ledger '${ledgerId}' not found`);
      }
      return Ok(ledger.summary());
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Simplified facade: record token usage for a session without requiring
   * a full RawUsageRecord. Derives a minimal record from the three scalar
   * parameters and delegates to the existing open ledger for the session.
   *
   * @param sessionId - identifies the open ledger
   * @param tokens    - total tokens (split evenly between input and output)
   * @param costUsd   - cost in US dollars for this call
   * @returns the updated UsageLedger aggregate
   */
  async recordTokenUsage(
    sessionId: string,
    tokens: number,
    costUsd: number,
  ): Promise<Result<UsageLedger>> {
    try {
      const sid    = toSessionId(sessionId);
      const ledger = await this.repo.getBySession(sid);
      if (!ledger) {
        return Err(`No open ledger found for session '${sessionId}'`);
      }
      const half = Math.floor(tokens / 2);
      ledger.addRecord({
        model:        'unknown',
        inputTokens:  half,
        outputTokens: tokens - half,
        costUsd,
      });
      await this.persist(ledger);
      return Ok(ledger);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Return the open (or sealed) UsageLedger aggregate for a session.
   * Fails if no ledger exists for the session.
   *
   * @param sessionId - session whose ledger to retrieve
   * @returns the UsageLedger aggregate (not just a summary)
   */
  async getLedger(sessionId: string): Promise<Result<UsageLedger>> {
    try {
      const sid    = toSessionId(sessionId);
      const ledger = await this.repo.getBySession(sid);
      if (!ledger) {
        return Err(`No open ledger found for session '${sessionId}'`);
      }
      return Ok(ledger);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Compute the sum of totalCostUsd across ALL persisted ledgers.
   * Delegates to listByDateRange with no bounds to retrieve every ledger.
   *
   * @returns total cost in USD as a number
   */
  async getTotalCost(): Promise<Result<number>> {
    try {
      const ledgers = await this.repo.listByDateRange();
      const total   = ledgers.reduce((sum, l) => sum + l.summary().totalCostUsd, 0);
      return Ok(total);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
