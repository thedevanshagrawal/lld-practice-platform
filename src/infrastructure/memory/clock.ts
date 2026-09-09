import type { Now } from '../../domain/ports/Clock';

/** Production default. The only place in the codebase that calls `new Date()` bare. */
export const systemNow: Now = () => new Date();

/** A clock that does not move. History ordering assertions become exact. */
export function fixedNow(instant: Date | string): Now {
  const frozen = typeof instant === 'string' ? new Date(instant) : instant;
  return () => new Date(frozen.getTime());
}

/** Advances by a fixed step on every call, so ordering is deterministic and distinct. */
export function tickingNow(start: Date | string, stepMs = 1000): Now {
  const origin = typeof start === 'string' ? new Date(start) : start;
  let calls = 0;
  return () => {
    const at = new Date(origin.getTime() + calls * stepMs);
    calls += 1;
    return at;
  };
}
