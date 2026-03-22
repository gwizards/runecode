/**
 * Analytics bounded context — ConsentStatusVO and AnalyticsEventName Value Objects.
 *
 * Named ConsentStatusVO to avoid collision with the existing
 * `ConsentStatus` string-union type alias in types.ts.
 */

import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';

// ─── ConsentStatusVO ──────────────────────────────────────────────────────────

export type ConsentStatusValue = 'granted' | 'revoked' | 'pending';

export class ConsentStatusVO {
  private constructor(readonly value: ConsentStatusValue) {}

  static create(raw: string): Result<ConsentStatusVO> {
    const valid: ConsentStatusValue[] = ['granted', 'revoked', 'pending'];
    if (!valid.includes(raw as ConsentStatusValue)) {
      return Err(`Invalid consent status: '${raw}'`);
    }
    return Ok(new ConsentStatusVO(raw as ConsentStatusValue));
  }

  static granted(): ConsentStatusVO { return new ConsentStatusVO('granted'); }
  static revoked(): ConsentStatusVO { return new ConsentStatusVO('revoked'); }
  static pending(): ConsentStatusVO { return new ConsentStatusVO('pending'); }

  isGranted(): boolean { return this.value === 'granted'; }
  toString(): string { return this.value; }
}

// ─── AnalyticsEventName ───────────────────────────────────────────────────────

export class AnalyticsEventName {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<AnalyticsEventName> {
    if (!raw || raw.trim().length === 0) return Err('Event name cannot be empty');
    if (raw.length > 100) return Err('Event name too long (max 100 chars)');
    return Ok(new AnalyticsEventName(raw.trim()));
  }

  toString(): string { return this.value; }
}
