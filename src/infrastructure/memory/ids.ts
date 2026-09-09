import type { Id } from '../../domain/ids';
import type { IdGenerator } from '../../domain/ports/IdGenerator';

/**
 * Predictable ids so a test can assert exact values instead of "some string".
 * `new SequentialIdGenerator('att')` yields att-1, att-2, ...
 */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'id') {}

  next(): Id {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}

/** Hands out a fixed script of ids, then throws. Useful for exact-value assertions. */
export class ScriptedIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly ids: readonly Id[]) {}

  next(): Id {
    if (this.index >= this.ids.length) {
      throw new Error('ScriptedIdGenerator exhausted');
    }
    const id = this.ids[this.index]!;
    this.index += 1;
    return id;
  }
}

/** Production default. `crypto` is a platform global on Node 18+ and the Edge runtime. */
export class UuidIdGenerator implements IdGenerator {
  next(): Id {
    return globalThis.crypto.randomUUID();
  }
}
