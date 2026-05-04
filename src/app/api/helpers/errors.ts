import { ValidationError, ValidationErrorItem } from 'sequelize';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { HTTPError } from '@monkeytech/nodejs-core/network/errors/HTTPError';
import { HTTPStatus } from '@monkeytech/nodejs-core/network/types/response';

/**
 * Local mappers that run BEFORE the core mappers in app.ts. Two reasons we
 * keep these in-project rather than upstreaming to nodejs-core:
 *
 *   1. core's `apiErrorMapper` constructs `new HTTPError(status, message)`
 *      and drops `e.data` — so our handlers' symbolic codes
 *      (CANCELLATION_POLICY_LATE, SHIFT_DURATION_INVALID,
 *      AGE_REQUIREMENT_NOT_MET, ROLE_MISMATCH) never reach the client.
 *      `apiDataMapper` below restores the data passthrough.
 *
 *   2. core's `sequelizeValidationErrorMapper` returns the raw
 *      `notNull Violation: EventApplication.x cannot be null` text. The
 *      Flutter client surfaces that verbatim to the user, which is
 *      unfriendly. `friendlySequelizeMapper` reshapes it into
 *      `Field 'x' is required` with field+type metadata in `data`.
 *
 * Registered first in `app.ts` via `getErrorHandler(env, [...])`, so they
 * win over the core defaults without modifying the upstream package.
 */

export const apiDataMapper = (e: Error, env?: string): HTTPError | null => {
  if (e instanceof APIError) {
    return new HTTPError(
      e.status,
      env === 'production' ? '' : e.message,
      e.data,
    );
  }
  return null;
};

const buildSequelizeMessage = (item: ValidationErrorItem): string => {
  const field = item.path ?? 'field';
  // Sequelize's runtime `type` is mixed-case ('notNull Violation', 'unique
  // violation', 'Validation error'); its TS type only lists lowercase
  // variants, so we lowercase before comparing.
  const kind = String(item.type ?? '').toLowerCase();
  switch (kind) {
    case 'notnull violation':
      return `Field '${field}' is required`;
    case 'unique violation':
      return `Field '${field}' must be unique`;
    default:
      return item.message ?? `Invalid value for field '${field}'`;
  }
};

export const friendlySequelizeMapper = (e: Error, env?: string): HTTPError | null => {
  if (!(e instanceof ValidationError)) return null;
  const first = e.errors?.[0];
  const message = first
    ? buildSequelizeMessage(first)
    : (env === 'production' ? '' : e.message);
  const data = first
    ? { field: first.path ?? null, type: first.type ?? null }
    : {};
  return new HTTPError(HTTPStatus.BAD_REQUEST, message, data);
};
