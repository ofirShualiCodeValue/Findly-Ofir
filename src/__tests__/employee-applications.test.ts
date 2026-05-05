// Edge-case tests for the EMPLOYEE side of applications:
// - apply (proposed_amount validation, non-active event, dup apply)
// - DELETE /applications/:id  (cross-user isolation, 48h policy + force flag)
// - POST /applications/:id/report-hours

import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import { getErrorHandler } from '@monkeytech/nodejs-core/network/errors/middleware';
import { apiDataMapper } from '../app/api/helpers/errors';

jest.mock('../app/models/EventApplication', () => ({
  EventApplication: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    // Active Record statics — default impls in the global beforeEach
    // delegate to the lower-level mocks (Event.findOne, EventApplication
    // .findOne / create) so existing assertions continue to drive
    // behaviour without changes.
    applyToEvent: jest.fn(),
  },
  EventApplicationStatus: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CANCELLED_BY_EMPLOYEE: 'cancelled_by_employee',
    CANCELLED_BY_EMPLOYER: 'cancelled_by_employer',
  },
  HoursStatus: {
    NOT_REPORTED: 'not_reported',
    PENDING_APPROVAL: 'pending_approval',
    APPROVED: 'approved',
    REJECTED: 'rejected',
  },
}));

jest.mock('../app/models/Event', () => ({
  Event: { findOne: jest.fn(), findByPk: jest.fn() },
  EventStatus: {
    DRAFT: 'draft',
    ACTIVE: 'active',
    CANCELLED: 'cancelled',
    ENDED: 'ended',
  },
}));

jest.mock('../app/models/User', () => ({
  User: { findByPk: jest.fn() },
  UserRole: { EMPLOYER: 'employer', EMPLOYEE: 'employee' },
  UserStatus: { ACTIVE: 'active' },
}));

jest.mock('../app/api/v1/entities/employee/applications/base', () => ({
  EmployeeApplicationEntity: class {
    constructor(public instance: unknown) {}
    static includes() { return []; }
    async represent() {
      const i = this.instance as Record<string, unknown> | null;
      return i ? { ...i } : null;
    }
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const employeeAppsRouter = require('../app/api/v1/handlers/employee/applications').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EventApplication } = require('../app/models/EventApplication');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Event } = require('../app/models/Event');

function buildApp(currentUser = { id: 100, role: 'employee' }) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { currentUser?: typeof currentUser }).currentUser = currentUser;
    next();
  });
  app.use('/', employeeAppsRouter);
  app.use(getErrorHandler('test', [apiDataMapper] as never[]));
  return app;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { APIError } = require('@monkeytech/nodejs-core/api/errors/APIError');

/**
 * Wraps a plain EventApplication-like stub with the Active Record instance
 * methods the handler now calls (`cancelByEmployee`, `reportHours`).
 * Mirrors the real model so existing assertions on `update` still hold.
 */
function arApplication(stub: Record<string, unknown>): Record<string, unknown> {
  const update =
    (stub.update as jest.Mock | undefined) ?? jest.fn().mockResolvedValue(undefined);
  stub.update = update;

  stub.cancelByEmployee = jest.fn(async (opts: { force: boolean }) => {
    if (stub.status === 'cancelled_by_employee') {
      throw new APIError(400, 'Already cancelled');
    }
    const ev = stub.event as { startAt: Date } | undefined;
    if (ev && !opts.force) {
      const startMs = new Date(ev.startAt).getTime();
      const hoursUntil = (startMs - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil > 0 && hoursUntil < 48) {
        throw new APIError(409, 'Cancellation within 48 hours of the shift', {
          code: 'CANCELLATION_POLICY_LATE',
          policy_threshold_hours: 48,
          hours_until_shift: Math.round(hoursUntil * 100) / 100,
        });
      }
    }
    await update({ status: 'cancelled_by_employee', decidedAt: new Date() });
  });

  stub.reportHours = jest.fn(async (hours: number) => {
    if (stub.status !== 'approved') {
      throw new APIError(409, 'Only approved applications can report hours');
    }
    if (stub.hoursStatus === 'approved') {
      throw new APIError(409, 'Hours have already been approved by the employer');
    }
    const ev = stub.event as { endAt: Date } | undefined;
    if (!ev || new Date(ev.endAt).getTime() > Date.now()) {
      throw new APIError(409, 'The shift has not ended yet');
    }
    await update({
      reportedHours: String(hours),
      reportedAt: new Date(),
      hoursStatus: 'pending_approval',
    });
  });

  return stub;
}

beforeEach(() => {
  // Default impl for `EventApplication.applyToEvent` — mirrors the real
  // model so existing assertions on Event.findOne / EventApplication
  // .findOne / .create continue to drive behaviour.
  (EventApplication.applyToEvent as jest.Mock).mockImplementation(
    async (
      eventId: number,
      userId: number,
      input: { proposedAmount: number; note?: string | null },
    ) => {
      const event = await Event.findOne({
        where: { id: eventId, status: 'active' },
      });
      if (!event) throw new APIError(404, 'Event not found or not open');
      const existing = await EventApplication.findOne({
        where: { eventId, userId },
      });
      if (existing) throw new APIError(409, 'You have already applied to this event');
      return EventApplication.create({
        eventId,
        userId,
        status: 'pending',
        proposedAmount: String(input.proposedAmount),
        note: input.note ?? null,
      });
    },
  );
});

// --------------------- apply (POST /events/:eventId/apply) ---------------------

describe('POST /events/:eventId/apply', () => {
  it('rejects when proposed_amount is missing', async () => {
    const res = await request(buildApp())
      .post('/events/5/apply')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/proposed_amount/);
  });

  it('rejects negative proposed_amount', async () => {
    const res = await request(buildApp())
      .post('/events/5/apply')
      .send({ proposed_amount: -10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/>= 0/);
  });

  it('returns 404 for a non-active event (cancelled / draft)', async () => {
    // The handler queries `where: { id, status: ACTIVE }` — a cancelled/draft
    // event shows up as null, hence 404.
    (Event.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/events/5/apply')
      .send({ proposed_amount: 100 });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not open/);
  });

  it('returns 409 when the worker already applied', async () => {
    (Event.findOne as jest.Mock).mockResolvedValue({ id: 5, status: 'active' });
    (EventApplication.findOne as jest.Mock).mockResolvedValue({ id: 1 });

    const res = await request(buildApp())
      .post('/events/5/apply')
      .send({ proposed_amount: 100 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already applied/i);
  });

  it('creates an application with the current user id (not whatever the body says)', async () => {
    (Event.findOne as jest.Mock).mockResolvedValue({ id: 5, status: 'active' });
    (EventApplication.findOne as jest.Mock).mockResolvedValue(null);
    (EventApplication.create as jest.Mock).mockResolvedValue({ id: 77 });
    (EventApplication.findByPk as jest.Mock).mockResolvedValue({ id: 77 });

    await request(buildApp({ id: 100, role: 'employee' }))
      .post('/events/5/apply')
      // Try to spoof a different user — the handler must ignore this.
      .send({ proposed_amount: 250, userId: 999 });

    expect(EventApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 100, eventId: 5 }),
    );
  });
});

// --------------------- cancel (DELETE /applications/:id) ---------------------

describe('DELETE /applications/:id (cancel my own)', () => {
  it('returns 404 when the application belongs to a different worker', async () => {
    // The handler queries `where: { id, userId: currentUser.id }`. A foreign
    // worker's app shows up as null — so cross-user cancel is silently 404.
    (EventApplication.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp({ id: 100, role: 'employee' }))
      .delete('/applications/22');
    expect(res.status).toBe(404);
  });

  it('returns 400 when the application is already cancelled', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue(arApplication({
      id: 22,
      status: 'cancelled_by_employee',
      event: { startAt: new Date(Date.now() + 7 * 24 * 3600_000) },
      update: jest.fn(),
    }));

    const res = await request(buildApp())
      .delete('/applications/22');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already cancelled/i);
  });

  it('blocks cancellation within 48h without force, returning CANCELLATION_POLICY_LATE', async () => {
    // Shift starts in 24h — well within the 48h window.
    (EventApplication.findOne as jest.Mock).mockResolvedValue(arApplication({
      id: 22,
      status: 'pending',
      event: { startAt: new Date(Date.now() + 24 * 3600_000) },
      update: jest.fn(),
    }));

    const res = await request(buildApp())
      .delete('/applications/22');
    expect(res.status).toBe(409);
    expect(res.body.data.code).toBe('CANCELLATION_POLICY_LATE');
    expect(res.body.data.policy_threshold_hours).toBe(48);
    // hours_until_shift should be ~24 (allow some slack for test runtime).
    expect(res.body.data.hours_until_shift).toBeGreaterThan(20);
    expect(res.body.data.hours_until_shift).toBeLessThan(25);
  });

  it('proceeds with the cancellation when force=true is passed', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    (EventApplication.findOne as jest.Mock).mockResolvedValue(arApplication({
      id: 22,
      status: 'pending',
      event: { startAt: new Date(Date.now() + 24 * 3600_000) },
      update: updateMock,
    }));
    (EventApplication.findByPk as jest.Mock).mockResolvedValue({ id: 22 });

    const res = await request(buildApp())
      .delete('/applications/22?force=true');

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled_by_employee' }),
    );
  });

  it('cancels freely when more than 48 hours remain', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    (EventApplication.findOne as jest.Mock).mockResolvedValue(arApplication({
      id: 22,
      status: 'pending',
      event: { startAt: new Date(Date.now() + 5 * 24 * 3600_000) }, // 5 days
      update: updateMock,
    }));
    (EventApplication.findByPk as jest.Mock).mockResolvedValue({ id: 22 });

    const res = await request(buildApp())
      .delete('/applications/22');

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalled();
  });
});

// --------------------- report-hours (POST /applications/:id/report-hours) ---------------------

describe('POST /applications/:id/report-hours', () => {
  it('rejects hours outside 0..24', async () => {
    const res = await request(buildApp())
      .post('/applications/22/report-hours')
      .send({ hours: 30 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when application belongs to another worker', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/applications/22/report-hours')
      .send({ hours: 8 });
    expect(res.status).toBe(404);
  });

  it('blocks reporting when application is not approved', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue(arApplication({
      id: 22,
      status: 'pending',
      event: { endAt: new Date(Date.now() - 60_000) },
      hoursStatus: 'not_reported',
      update: jest.fn(),
    }));

    const res = await request(buildApp())
      .post('/applications/22/report-hours')
      .send({ hours: 8 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/approved/);
  });

  it('blocks reporting before the shift has ended', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue(arApplication({
      id: 22,
      status: 'approved',
      event: { endAt: new Date(Date.now() + 3600_000) },
      hoursStatus: 'not_reported',
      update: jest.fn(),
    }));

    const res = await request(buildApp())
      .post('/applications/22/report-hours')
      .send({ hours: 8 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/has not ended/);
  });

  it('blocks re-reporting once the employer has approved hours', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue(arApplication({
      id: 22,
      status: 'approved',
      event: { endAt: new Date(Date.now() - 60_000) },
      hoursStatus: 'approved',
      update: jest.fn(),
    }));

    const res = await request(buildApp())
      .post('/applications/22/report-hours')
      .send({ hours: 8 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already been approved/);
  });
});
