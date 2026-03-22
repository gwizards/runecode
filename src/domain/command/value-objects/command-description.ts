/**
 * Command bounded context — CommandDescription and CommandCategory Value Objects.
 */

import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';

// ─── CommandDescription ───────────────────────────────────────────────────────

export class CommandDescription {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<CommandDescription> {
    if (raw.length > 500) return Err('Description too long (max 500 chars)');
    return Ok(new CommandDescription(raw));
  }

  static empty(): CommandDescription { return new CommandDescription(''); }

  toString(): string { return this.value; }
}

// ─── CommandCategory ──────────────────────────────────────────────────────────

export class CommandCategory {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<CommandCategory> {
    if (!raw || raw.trim().length === 0) return Err('Category cannot be empty');
    return Ok(new CommandCategory(raw.trim().toLowerCase()));
  }

  static general(): CommandCategory { return new CommandCategory('general'); }

  toString(): string { return this.value; }
}
