// Shift business-rule tests:
// - duration must be 6..12 hours, both inclusive
// - end_at must be strictly after start_at
// - 400 carries the SHIFT_DURATION_INVALID code so the Flutter "Invalid
//   duration" popup can render the actual numbers.

import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import { getErrorHandler } from '@monkeytech/nodejs-core/network/errors/middleware';
import { apiDataMapper } from '../app/api/helpers/errors';

jest.mock('../app/models/Shift', () => ({
  Shift: { findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  ShiftStatus: { ACTIVE: 'active', CANCELLED: 'cancelled' },
}));
jest.mock('../app/models/ShiftStaffingRequirement', () => ({
  ShiftStaffingRequirement: {
    bulkCreate: jest.fn().mockResolvedValue([]),
    destroy: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../app/models/IndustrySubCategory', () => ({
  IndustrySubCategory: { count: jest.fn().mockResolvedValue(0) },
}));

// loadOwnedEvent is the only authorization gate — stub it to "yes, this
// employer owns the event" by default.
jest.mock('../app/api/helpers/events', () => ({
  loadOwnedEvent: jest.fn(),
}));

// The shift router hits db/connection.sequelize.transaction. Replace it
// with a stub that just runs the callback so we don't need a real DB.
jest.mock('../db/connection', () => ({
  sequelize: {
    transaction: (fn: (t: unknown) => Promise<unknown>) => fn({}),
  },
}));

jest.mock('../app/api/v1/entities/employer/shifts/base', () => ({
  ShiftEntity: class {
    constructor(public instance: unknown) {}
    static includes() { return []; }
    async represent() {
      const i = this.instance as Record<string, unknown> | null;
      return i ? { ...i } : null;
    }
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const shiftsRouter = require('../app/api/v1/handlers/employer/shifts').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadOwnedEvent } = require('../app/api/helpers/events');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Shift } = require('../app/models/Shift');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { currentUser?: { id: number; role: string } }).currentUser = {
      id: 99,
      role: 'employer',
    };
    next();
  });
  app.use('/events/:eventId/shifts', shiftsRouter);
  app.use(getErrorHandler('test', [apiDataMapper] as never[]));
  return app;
}

beforeEach(() => {
  (loadOwnedEvent as jest.Mock).mockResolvedValue({ id: 7, createdByUserId: 99 });
  (Shift.create as jest.Mock).mockResolvedValue({ id: 50 });
  (Shift.findByPk as jest.Mock).mockResolvedValue({ id: 50 });
});

// Helper: build start/end times N hours apart, anchored on a stable date so
// the test isn't sensitive to "now".
function shiftHours(hours: number) {
  const start = new Date('2026-06-01T10:00:00Z');
  const end = new Date(start.getTime() + hours * 3600_000);
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

describe('POST /events/:eventId/shifts — duration rules', () => {
  it('rejects a shift shorter than 6 hours with SHIFT_DURATION_INVALID', async () => {
    const res = await request(buildApp())
      .post('/events/7/shifts')
      .send(shiftHours(5));

    expect(res.status).toBe(400);
    expect(res.body.data.code).toBe('SHIFT_DURATION_INVALID');
    expect(res.body.data.min_hours).toBe(6);
    expect(res.body.data.max_hours).toBe(12);
    expect(res.body.data.actual_hours).toBe(5);
  });

  it('rejects a shift longer than 12 hours with SHIFT_DURATION_INVALID', async () => {
    const res = await request(buildApp())
      .post('/events/7/shifts')
      .send(shiftHours(13));

    expect(res.status).toBe(400);
    expect(res.body.data.code).toBe('SHIFT_DURATION_INVALID');
    expect(res.body.data.actual_hours).toBe(13);
  });

  it('accepts a shift exactly 6 hours long', async () => {
    const res = await request(buildApp())
      .post('/events/7/shifts')
      .send(shiftHours(6));
    expect(res.status).toBe(201);
  });

  it('accepts a shift exactly 12 hours long', async () => {
    const res = await request(buildApp())
      .post('/events/7/shifts')
      .send(shiftHours(12));
    expect(res.status).toBe(201);
  });

  it('rejects when end_at <= start_at', async () => {
    const res = await request(buildApp())
      .post('/events/7/shifts')
      .send({
        start_at: '2026-06-01T10:00:00Z',
        end_at: '2026-06-01T10:00:00Z', // identical → not strictly after
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/after start_at/);
  });

  it('rejects when start_at or end_at is malformed', async () => {
    const res = await request(buildApp())
      .post('/events/7/shifts')
      .send({ start_at: 'not-a-date', end_at: '2026-06-01T10:00:00Z' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid start_at/);
  });

  it('rejects when start_at or end_at is missing', async () => {
    const res = await request(buildApp())
      .post('/events/7/shifts')
      .send({ start_at: '2026-06-01T10:00:00Z' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Missing fields: end_at/);
  });

  it('returns 404 when the event belongs to another employer', async () => {
    const { APIError } = require('@monkeytech/nodejs-core/api/errors/APIError');
    (loadOwnedEvent as jest.Mock).mockRejectedValue(new APIError(404, 'Event not found'));

    const res = await request(buildApp())
      .post('/events/7/shifts')
      .send(shiftHours(8));
    expect(res.status).toBe(404);
  });
});
