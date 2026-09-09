/**
 * Timestamps drive history ordering and are asserted in tests. A hidden `new Date()`
 * inside a use case makes those assertions flaky or forces sleeps.
 */
export interface Clock {
  now(): Date;
}

/**
 * The injected form. Use cases take `now: Now` rather than a `Clock` object because
 * a one-method interface passed as a function is less ceremony at every call site
 * and reads identically in a test: `now: () => new Date('2026-09-10T10:00:00Z')`.
 */
export type Now = () => Date;
