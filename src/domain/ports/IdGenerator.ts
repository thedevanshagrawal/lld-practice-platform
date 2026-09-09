import type { Id } from '../ids';

/**
 * Without this the domain either invents ids with a library import (breaking the
 * one rule) or asks Mongo for them, which would make `Attempt.start()` async for
 * no reason.
 */
export interface IdGenerator {
  next(): Id;
}
