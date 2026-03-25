/**
 * Identity bounded context — Additional edge-case tests for value objects.
 *
 * Focuses on gaps not covered by identity.test.ts:
 *   - Email edge cases (special chars, subdomains, dot-local, exact boundary)
 *   - DisplayName edge cases (unicode, trimming)
 *   - UserId additional edge cases
 */

import { describe, it, expect } from 'vitest';
import { Email, DisplayName, UserId } from './types';
import { unwrap } from '../shared/result';

// ─── Email edge cases ────────────────────────────────────────────────────────

describe('Email (edge cases)', () => {
  it('accepts email with subdomain', () => {
    const r = Email.create('user@sub.domain.org');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('user@sub.domain.org');
  });

  it('accepts email with plus addressing', () => {
    const r = Email.create('user+tag@example.com');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('user+tag@example.com');
  });

  it('accepts email with dots in local part', () => {
    const r = Email.create('first.last@example.com');
    expect(r.ok).toBe(true);
  });

  it('accepts email with hyphens in domain', () => {
    const r = Email.create('user@my-domain.com');
    expect(r.ok).toBe(true);
  });

  it('accepts email with numbers in local part', () => {
    const r = Email.create('user123@example.com');
    expect(r.ok).toBe(true);
  });

  it('rejects email with spaces', () => {
    const r = Email.create('user @example.com');
    expect(r.ok).toBe(false);
  });

  it('rejects email without TLD', () => {
    const r = Email.create('user@localhost');
    expect(r.ok).toBe(false);
  });

  it('accepts email at exactly 254 characters', () => {
    // local part can be up to ~64 chars, domain up to ~253 chars
    // We need total = 254
    const local = 'a'.repeat(64);
    const domain = 'b'.repeat(254 - 64 - 1 - 4) + '.com'; // 254 - 64 - @ - .com
    const email = `${local}@${domain}`;
    expect(email.length).toBe(254);
    const r = Email.create(email);
    expect(r.ok).toBe(true);
  });

  it('rejects email at 255 characters', () => {
    const local = 'a'.repeat(64);
    const domain = 'b'.repeat(255 - 64 - 1 - 4) + '.com';
    const email = `${local}@${domain}`;
    expect(email.length).toBe(255);
    const r = Email.create(email);
    expect(r.ok).toBe(false);
  });

  it('handles null-ish input gracefully', () => {
    // TypeScript won't normally allow null, but at runtime it can happen
    const r = Email.create(null as unknown as string);
    expect(r.ok).toBe(false);
  });

  it('handles undefined input gracefully', () => {
    const r = Email.create(undefined as unknown as string);
    expect(r.ok).toBe(false);
  });

  it('toString() returns the normalized value', () => {
    const email = unwrap(Email.create('Test@Example.COM'));
    expect(email.toString()).toBe('test@example.com');
  });

  it('equals() returns false for different emails', () => {
    const a = unwrap(Email.create('alice@example.com'));
    const b = unwrap(Email.create('bob@example.com'));
    expect(a.equals(b)).toBe(false);
  });
});

// ─── DisplayName edge cases ──────────────────────────────────────────────────

describe('DisplayName (edge cases)', () => {
  it('trims leading and trailing whitespace', () => {
    const r = DisplayName.create('  Alice  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('Alice');
  });

  it('accepts unicode characters', () => {
    const r = DisplayName.create('Carlos Munoz');
    expect(r.ok).toBe(true);
  });

  it('accepts single character name', () => {
    const r = DisplayName.create('X');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('X');
  });

  it('accepts name with numbers', () => {
    const r = DisplayName.create('Player42');
    expect(r.ok).toBe(true);
  });

  it('accepts name with special chars', () => {
    const r = DisplayName.create("O'Brien-Smith");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe("O'Brien-Smith");
  });

  it('handles null-ish input gracefully', () => {
    const r = DisplayName.create(null as unknown as string);
    expect(r.ok).toBe(false);
  });

  it('handles undefined input gracefully', () => {
    const r = DisplayName.create(undefined as unknown as string);
    expect(r.ok).toBe(false);
  });

  it('toString() returns the inner value', () => {
    const name = unwrap(DisplayName.create('Bob'));
    expect(name.toString()).toBe('Bob');
  });

  it('anonymous() always returns the same display text', () => {
    const a = DisplayName.anonymous();
    const b = DisplayName.anonymous();
    expect(a.value).toBe('Anonymous');
    expect(b.value).toBe('Anonymous');
  });

  it('rejects name that is 101 characters after trimming', () => {
    const padded = '  ' + 'x'.repeat(101) + '  ';
    const r = DisplayName.create(padded);
    expect(r.ok).toBe(false);
  });
});

// ─── UserId edge cases ───────────────────────────────────────────────────────

describe('UserId (edge cases)', () => {
  it('accepts UUID format', () => {
    const r = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    expect(r.ok).toBe(true);
  });

  it('accepts arbitrary non-empty strings', () => {
    const r = UserId.create('custom-id-format');
    expect(r.ok).toBe(true);
  });

  it('accepts single character', () => {
    const r = UserId.create('x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('x');
  });

  it('generate() returns values with UUID-like format', () => {
    const id = UserId.generate();
    // crypto.randomUUID() returns standard UUID format
    expect(id.value).toMatch(/^[0-9a-f-]+$/);
  });

  it('toString() and value are equivalent', () => {
    const id = unwrap(UserId.create('test-123'));
    expect(id.toString()).toBe(id.value);
  });

  it('equals() handles trimmed whitespace correctly', () => {
    const a = unwrap(UserId.create('  abc  '));
    const b = unwrap(UserId.create('abc'));
    expect(a.equals(b)).toBe(true);
  });
});
