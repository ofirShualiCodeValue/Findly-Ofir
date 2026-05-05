// Shared input-validation helpers used by HTTP handlers.
//
// Handlers should perform pure shape/format checks here before calling into
// model methods. State-dependent rules (FK existence, status guards, etc.)
// stay on the model.

import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';

/**
 * Assert that `value` is a finite number in the closed range [-range, range].
 * Used for both latitude (range=90) and longitude (range=180).
 *
 * Throws APIError(400) on failure; returns the parsed number on success.
 */
export function assertCoord(value: unknown, field: string, range: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < -range || n > range) {
    throw new APIError(400, `${field} must be a number between -${range} and ${range}`);
  }
  return n;
}
