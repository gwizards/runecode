/**
 * Usage bounded context — UsageAmount and ModelId Value Objects.
 */

import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';

// ─── UsageAmount ──────────────────────────────────────────────────────────────

export class UsageAmount {
  private constructor(
    readonly tokens: number,
    readonly costUsd: number,
  ) {}

  static create(tokens: number, costUsd: number): Result<UsageAmount> {
    if (tokens < 0) return Err('tokens cannot be negative');
    if (costUsd < 0) return Err('costUsd cannot be negative');
    return Ok(new UsageAmount(tokens, costUsd));
  }

  static zero(): UsageAmount { return new UsageAmount(0, 0); }

  add(other: UsageAmount): UsageAmount {
    return new UsageAmount(this.tokens + other.tokens, this.costUsd + other.costUsd);
  }
}

// ─── ModelId ──────────────────────────────────────────────────────────────────

export class ModelId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ModelId> {
    if (!raw || raw.trim().length === 0) return Err('ModelId cannot be empty');
    return Ok(new ModelId(raw.trim()));
  }

  static unknown(): ModelId { return new ModelId('unknown'); }

  toString(): string { return this.value; }
}
