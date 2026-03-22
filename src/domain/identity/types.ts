/**
 * Identity bounded context — Value Objects.
 *
 * All VOs are immutable, class-based, and return Result<T> from factory methods.
 * Zero infrastructure imports.
 */

import { Result, Ok, Err } from '../shared/result';

// ─── UserId ───────────────────────────────────────────────────────────────────

export class UserId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<UserId> {
    if (!raw || !raw.trim()) return Err('UserId cannot be empty');
    return Ok(new UserId(raw.trim()));
  }

  static generate(): UserId {
    return new UserId(crypto.randomUUID());
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────

export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Email> {
    const normalized = (raw ?? '').trim().toLowerCase();
    if (!normalized) return Err('Email cannot be empty');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
      return Err(`Invalid email format: '${normalized}'`);
    if (normalized.length > 254) return Err('Email too long (max 254 chars)');
    return Ok(new Email(normalized));
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ─── DisplayName ──────────────────────────────────────────────────────────────

export class DisplayName {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<DisplayName> {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return Err('DisplayName cannot be empty');
    if (trimmed.length > 100) return Err('DisplayName too long (max 100 chars)');
    return Ok(new DisplayName(trimmed));
  }

  static anonymous(): DisplayName {
    return new DisplayName('Anonymous');
  }

  toString(): string {
    return this.value;
  }
}
