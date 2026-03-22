/**
 * Workspace bounded context — TabLabel and TabPath Value Objects.
 */

import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';

// ─── TabLabel ─────────────────────────────────────────────────────────────────

export class TabLabel {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<TabLabel> {
    if (!raw || raw.trim().length === 0) return Err('Tab label cannot be empty');
    if (raw.length > 200) return Err('Tab label too long (max 200 chars)');
    return Ok(new TabLabel(raw.trim()));
  }

  static fromPath(path: string): TabLabel {
    const name = path.split('/').pop() ?? path;
    return new TabLabel(name || path);
  }

  toString(): string { return this.value; }
}

// ─── TabPath ──────────────────────────────────────────────────────────────────

export class TabPath {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<TabPath> {
    if (!raw || raw.trim().length === 0) return Err('Tab path cannot be empty');
    return Ok(new TabPath(raw.trim()));
  }

  toString(): string { return this.value; }
}
