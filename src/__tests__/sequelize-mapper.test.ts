import { ValidationError, ValidationErrorItem } from 'sequelize';
import { friendlySequelizeMapper } from '../app/api/helpers/errors';

// Helper to construct a real Sequelize ValidationError without touching a DB.
function makeError(items: Array<{ path: string; type: string; message?: string }>): ValidationError {
  const errs = items.map(
    (i) =>
      new ValidationErrorItem(
        i.message ?? `${i.path} validation failed`,
        i.type as ValidationErrorItem['type'],
        i.path,
        null,
        null as never,
        i.path,
        null as never,
        null as never,
      ),
  );
  return new ValidationError(items.map((i) => i.message ?? '').join('\n'), errs);
}

describe('friendlySequelizeMapper', () => {
  it('returns null for non-Sequelize errors', () => {
    expect(friendlySequelizeMapper(new Error('boom'))).toBeNull();
  });

  it('translates a notNull violation to a friendly message', () => {
    const err = makeError([{ path: 'hoursStatus', type: 'notNull Violation' }]);
    const http = friendlySequelizeMapper(err);
    expect(http?.status).toBe(400);
    expect(http?.message).toBe(`Field 'hoursStatus' is required`);
    expect(http?.data).toEqual({ field: 'hoursStatus', type: 'notNull Violation' });
  });

  it('translates a unique violation', () => {
    const err = makeError([{ path: 'phone', type: 'unique violation' }]);
    const http = friendlySequelizeMapper(err);
    expect(http?.status).toBe(400);
    expect(http?.message).toBe(`Field 'phone' must be unique`);
  });

  it('falls back to the per-item message for other validators', () => {
    const err = makeError([
      { path: 'email', type: 'Validation error', message: 'Validation isEmail on email failed' },
    ]);
    const http = friendlySequelizeMapper(err);
    expect(http?.status).toBe(400);
    expect(http?.message).toBe('Validation isEmail on email failed');
  });

  it('only inspects the first error item when several are present', () => {
    const err = makeError([
      { path: 'first', type: 'notNull Violation' },
      { path: 'second', type: 'notNull Violation' },
    ]);
    const http = friendlySequelizeMapper(err);
    expect(http?.message).toBe(`Field 'first' is required`);
  });
});
