// Handler-level tests for the employer "applications" routes. We mock all
// Sequelize models + the auth middleware so the test never touches a DB.

import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import { getErrorHandler } from '@monkeytech/nodejs-core/network/errors/middleware';

// ---------------------------- Model mocks ----------------------------
// jest.mock() calls are hoisted above the imports below, so the handler
// file picks up these stubs when it imports the models.

jest.mock('../app/models/EventApplication', () => ({
  EventApplication: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
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

jest.mock('../app/models/WorkerRating', () => ({
  WorkerRating: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
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
  User: { findByPk: jest.fn(), findOne: jest.fn() },
  UserRole: { EMPLOYER: 'employer', EMPLOYEE: 'employee' },
  UserStatus: { ACTIVE: 'active', BANNED: 'banned' },
}));

jest.mock('../app/models/EmployeeProfile', () => ({ EmployeeProfile: {} }));
jest.mock('../app/models/Industry', () => ({ Industry: {} }));
jest.mock('../app/models/IndustrySubCategory', () => ({ IndustrySubCategory: {} }));

// Skip the real entity (it pulls in User decorators); the rating handler
// just produces a plain JSON object so the entity isn't needed for those.
jest.mock('../app/api/v1/entities/employer/applications/base', () => ({
  ApplicationBaseEntity: class {
    constructor(public instance: unknown) {}
    static includes() { return []; }
    async represent() {
      // The instance might be a plain object or a fresh.findByPk return —
      // both shapes carry the fields we care about for the assertions.
      const i = this.instance as Record<string, unknown> | null;
      return i ? { ...i } : null;
    }
  },
}));

// Stub the helper that loads the event (so we don't touch Event.findOne).
jest.mock('../app/api/helpers/events', () => ({
  loadOwnedEvent: jest.fn(),
}));

// ---------------------------- Imports (after mocks) ----------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const applicationsRouter = require('../app/api/v1/handlers/employer/applications').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EventApplication } = require('../app/models/EventApplication');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WorkerRating } = require('../app/models/WorkerRating');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadOwnedEvent } = require('../app/api/helpers/events');

// ---------------------------- Helpers ----------------------------

function buildApp(currentUser: { id: number; role: string } = { id: 99, role: 'employer' }) {
  const app = express();
  app.use(express.json());
  // Stub auth middleware: inject the test user, no JWT/DB lookup.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { currentUser?: typeof currentUser }).currentUser = currentUser;
    next();
  });
  // Match the way employer/main.ts mounts it (with mergeParams for :eventId).
  app.use('/events/:eventId/applications', applicationsRouter);
  app.use(getErrorHandler('test'));
  return app;
}

const ownedEventStub = { id: 7, createdByUserId: 99, name: 'E', status: 'active' };

// ---------------------------- Tests ----------------------------

describe('PUT /events/:eventId/applications/:applicationId/rating', () => {
  beforeEach(() => {
    (loadOwnedEvent as jest.Mock).mockResolvedValue(ownedEventStub);
  });

  it('rejects rating outside 1..5', async () => {
    const app = buildApp();
    const res = await request(app)
      .put('/events/7/applications/22/rating')
      .send({ rating: 6 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/between 1 and 5/i);
  });

  it('returns 404 when application not found', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app)
      .put('/events/7/applications/22/rating')
      .send({ rating: 4 });
    expect(res.status).toBe(404);
  });

  it('rejects rating when application not approved', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      userId: 33,
      status: 'pending',
      event: { endAt: new Date(Date.now() - 60_000) }, // already ended
    });

    const app = buildApp();
    const res = await request(app)
      .put('/events/7/applications/22/rating')
      .send({ rating: 5 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/approved/i);
  });

  it('rejects rating when shift has not ended yet', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      userId: 33,
      status: 'approved',
      event: { endAt: new Date(Date.now() + 3600_000) },
    });

    const app = buildApp();
    const res = await request(app)
      .put('/events/7/applications/22/rating')
      .send({ rating: 5 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/has not ended/i);
  });

  it('creates a new rating on first call (idempotent path absent)', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      userId: 33,
      status: 'approved',
      event: { endAt: new Date(Date.now() - 60_000) },
    });
    (WorkerRating.findOne as jest.Mock).mockResolvedValue(null);
    (WorkerRating.create as jest.Mock).mockResolvedValue({ id: 1 });
    (WorkerRating.findAll as jest.Mock).mockResolvedValue([{ rating: 4 }, { rating: 5 }]);

    const app = buildApp();
    const res = await request(app)
      .put('/events/7/applications/22/rating')
      .send({ rating: 5, comment: 'great worker' });

    expect(res.status).toBe(200);
    expect(WorkerRating.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workerUserId: 33,
        ratedByUserId: 99,
        eventApplicationId: 22,
        rating: 5,
        comment: 'great worker',
      }),
    );
    expect(res.body.data.worker_rating).toEqual({ avg: 4.5, count: 2 });
  });

  it('updates the existing rating on a repeat call (idempotency)', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      userId: 33,
      status: 'approved',
      event: { endAt: new Date(Date.now() - 60_000) },
    });
    (WorkerRating.findOne as jest.Mock).mockResolvedValue({
      id: 5,
      update: updateMock,
    });
    (WorkerRating.findAll as jest.Mock).mockResolvedValue([{ rating: 3 }]);

    const app = buildApp();
    const res = await request(app)
      .put('/events/7/applications/22/rating')
      .send({ rating: 3, comment: null });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ rating: 3, comment: null });
    expect(WorkerRating.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /events/:eventId/applications/:applicationId  (decide)', () => {
  beforeEach(() => {
    (loadOwnedEvent as jest.Mock).mockResolvedValue(ownedEventStub);
  });

  it('rejects an unknown status value', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch('/events/7/applications/22')
      .send({ status: 'totally-bogus' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/approved|rejected|cancelled_by_employer/);
  });

  it('approves a pending application', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const application = {
      id: 22,
      eventId: 7,
      userId: 33,
      status: 'pending',
      update: updateMock,
    };
    (EventApplication.findOne as jest.Mock).mockResolvedValue(application);
    (EventApplication.findByPk as jest.Mock).mockResolvedValue({
      ...application,
      status: 'approved',
    });

    const app = buildApp();
    const res = await request(app)
      .patch('/events/7/applications/22')
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', decidedByUserId: 99 }),
    );
  });

  it('returns 404 when the application is not on the owned event', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app)
      .patch('/events/7/applications/22')
      .send({ status: 'approved' });
    expect(res.status).toBe(404);
  });
});

describe('cross-employer isolation', () => {
  it('returns 404 when the event belongs to another employer (loadOwnedEvent throws)', async () => {
    // Simulate the helper finding no event for this user — its real
    // implementation queries `where: { id, createdByUserId: req.currentUser.id }`,
    // so a foreign event shows up as "not found" rather than as 403.
    const { APIError } = require('@monkeytech/nodejs-core/api/errors/APIError');
    (loadOwnedEvent as jest.Mock).mockRejectedValue(new APIError(404, 'Event not found'));

    const app = buildApp({ id: 99, role: 'employer' });

    const list = await request(app).get('/events/7/applications');
    expect(list.status).toBe(404);

    const detail = await request(app).get('/events/7/applications/22');
    expect(detail.status).toBe(404);

    const decide = await request(app)
      .patch('/events/7/applications/22')
      .send({ status: 'approved' });
    expect(decide.status).toBe(404);

    const rate = await request(app)
      .put('/events/7/applications/22/rating')
      .send({ rating: 5 });
    expect(rate.status).toBe(404);
  });
});

describe('terminal-state guards on PATCH (decide)', () => {
  beforeEach(() => {
    (loadOwnedEvent as jest.Mock).mockResolvedValue(ownedEventStub);
  });

  it('rejects approve on an already-approved application', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      status: 'approved',
      update: jest.fn(),
    });

    const app = buildApp();
    const res = await request(app)
      .patch('/events/7/applications/22')
      .send({ status: 'approved' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot change status from approved/);
  });

  it('rejects approve on a rejected application', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      status: 'rejected',
      update: jest.fn(),
    });

    const app = buildApp();
    const res = await request(app)
      .patch('/events/7/applications/22')
      .send({ status: 'approved' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot change status from rejected/);
  });

  it('rejects approve on an application the worker already cancelled', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      status: 'cancelled_by_employee',
      update: jest.fn(),
    });

    const app = buildApp();
    const res = await request(app)
      .patch('/events/7/applications/22')
      .send({ status: 'approved' });

    expect(res.status).toBe(400);
  });

  it('still allows the employer to record cancellation_by_employer at any state', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      status: 'approved',
      update: updateMock,
    });
    (EventApplication.findByPk as jest.Mock).mockResolvedValue({
      id: 22,
      status: 'cancelled_by_employer',
    });

    const app = buildApp();
    const res = await request(app)
      .patch('/events/7/applications/22')
      .send({ status: 'cancelled_by_employer' });

    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled_by_employer' }),
    );
  });
});

describe('GET /events/:eventId/applications/:applicationId  (full applicant)', () => {
  beforeEach(() => {
    (loadOwnedEvent as jest.Mock).mockResolvedValue(ownedEventStub);
  });

  it('returns 404 when the application is not found', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue(null);
    const app = buildApp();
    const res = await request(app).get('/events/7/applications/999');
    expect(res.status).toBe(404);
  });

  it('returns the full applicant payload (profile + rating + history)', async () => {
    (EventApplication.findOne as jest.Mock).mockResolvedValue({
      id: 22,
      userId: 33,
      status: 'pending',
      proposedAmount: '500',
      note: 'available',
      createdAt: new Date('2026-04-01T10:00:00Z'),
      decidedAt: null,
      applicant: {
        id: 33,
        fullName: 'דנה כהן',
        phone: '+972500000000',
        email: 'dana@example.com',
        employeeProfile: {
          avatarUrl: '/uploads/a.jpg',
          dateOfBirth: '1995-04-12',
          workStatus: 'freelancer',
          homeCity: 'תל אביב',
          locationRangeKm: 30,
          baseHourlyRate: '60',
        },
        industries: [{ id: 1, name: 'אירועים', slug: 'events' }],
        industrySubCategories: [
          { id: 11, industryId: 1, name: 'הפקה', slug: 'production' },
          { id: 12, industryId: 1, name: 'צילום', slug: 'photo' },
        ],
      },
    });
    (WorkerRating.findAll as jest.Mock).mockImplementation((opts: { where?: unknown }) => {
      // First call (averageRatingFor) only selects [rating]; second call
      // (history) eager-loads the EventApplication+Event association.
      if ((opts.where as { workerUserId?: number })?.workerUserId === 33) {
        // The handler distinguishes by `attributes` — both call sites use
        // workerUserId, so we differentiate by checking presence of `include`.
        if ('include' in opts) {
          return Promise.resolve([
            {
              id: 7,
              rating: 5,
              comment: 'מצוינת',
              createdAt: new Date('2026-03-01T00:00:00Z'),
              application: { event: { id: 1, name: 'חתונה' } },
            },
          ]);
        }
        return Promise.resolve([{ rating: 5 }, { rating: 4 }]);
      }
      return Promise.resolve([]);
    });

    const app = buildApp();
    const res = await request(app).get('/events/7/applications/22');

    expect(res.status).toBe(200);
    expect(res.body.data.applicant.full_name).toBe('דנה כהן');
    expect(res.body.data.applicant.profile.work_status).toBe('freelancer');
    expect(res.body.data.applicant.industry_sub_categories).toHaveLength(2);
    expect(res.body.data.rating.avg).toBe(4.5);
    expect(res.body.data.rating.history[0]).toMatchObject({
      rating: 5,
      comment: 'מצוינת',
      event: { id: 1, name: 'חתונה' },
    });
  });
});
