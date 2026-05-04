// Event-creation edge cases: validation of required fields, date ordering,
// budget non-negativity, required_employees positivity, and FK lookups for
// event_category_id / activity_area_id.

import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import { getErrorHandler } from '@monkeytech/nodejs-core/network/errors/middleware';

jest.mock('../app/models/Event', () => ({
  Event: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  },
  EventStatus: {
    DRAFT: 'draft',
    ACTIVE: 'active',
    CANCELLED: 'cancelled',
    ENDED: 'ended',
  },
}));
jest.mock('../app/models/EventCategory', () => ({
  EventCategory: { findByPk: jest.fn(), findAll: jest.fn(), count: jest.fn() },
}));
jest.mock('../app/models/ActivityArea', () => ({
  ActivityArea: { findByPk: jest.fn(), findAll: jest.fn(), count: jest.fn() },
}));

jest.mock('../app/api/v1/entities/employer/events/base', () => ({
  EventBaseEntity: class {
    constructor(public instance: unknown) {}
    static includes() { return []; }
    async represent() {
      const i = this.instance as Record<string, unknown> | null;
      return i ? { ...i } : null;
    }
  },
}));
jest.mock('../app/api/v1/entities/employer/events/full', () => ({
  EventFullEntity: class {
    constructor(public instance: unknown) {}
    static includes() { return []; }
    async represent() {
      const i = this.instance as Record<string, unknown> | null;
      return i ? { ...i } : null;
    }
  },
}));

jest.mock('../app/api/helpers/events', () => ({
  loadOwnedEvent: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const eventsRouter = require('../app/api/v1/handlers/employer/events').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Event } = require('../app/models/Event');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EventCategory } = require('../app/models/EventCategory');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ActivityArea } = require('../app/models/ActivityArea');

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
  app.use('/events', eventsRouter);
  app.use(getErrorHandler('test'));
  return app;
}

const baseValid = {
  name: 'Test Event',
  event_category_id: 1,
  activity_area_id: 2,
  start_at: '2026-07-01T10:00:00Z',
  end_at: '2026-07-01T18:00:00Z',
};

beforeEach(() => {
  // Default: category + area both exist.
  (EventCategory.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Wedding' });
  (ActivityArea.findByPk as jest.Mock).mockResolvedValue({ id: 2, name: 'Tel Aviv' });
  (Event.create as jest.Mock).mockResolvedValue({ id: 50 });
  (Event.findByPk as jest.Mock).mockResolvedValue({ id: 50 });
});

describe('POST /events — required fields', () => {
  it('rejects with the list of missing required fields', async () => {
    const res = await request(buildApp()).post('/events').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Missing fields/);
    expect(res.body.message).toMatch(/name/);
    expect(res.body.message).toMatch(/event_category_id/);
  });

  it('rejects when name is empty string (treated as missing)', async () => {
    const res = await request(buildApp())
      .post('/events')
      .send({ ...baseValid, name: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Missing fields/);
  });
});

describe('POST /events — date ordering', () => {
  it('rejects when end_at equals start_at', async () => {
    const res = await request(buildApp())
      .post('/events')
      .send({ ...baseValid, end_at: baseValid.start_at });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/after start_at/);
  });

  it('rejects when end_at is before start_at', async () => {
    const res = await request(buildApp())
      .post('/events')
      .send({
        ...baseValid,
        start_at: '2026-07-01T18:00:00Z',
        end_at: '2026-07-01T10:00:00Z',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/after start_at/);
  });

  it('rejects when start_at is malformed', async () => {
    const res = await request(buildApp())
      .post('/events')
      .send({ ...baseValid, start_at: 'banana' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid start_at/);
  });
});

describe('POST /events — numeric validation', () => {
  it('rejects negative budget', async () => {
    const res = await request(buildApp())
      .post('/events')
      .send({ ...baseValid, budget: -50 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/budget must be >= 0/);
  });

  it('accepts budget = 0 (volunteer/free event)', async () => {
    const res = await request(buildApp())
      .post('/events')
      .send({ ...baseValid, budget: 0 });
    expect(res.status).toBe(201);
  });

  it('rejects required_employees less than 1', async () => {
    const res = await request(buildApp())
      .post('/events')
      .send({ ...baseValid, required_employees: 0 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required_employees must be >= 1/);
  });
});

describe('POST /events — taxonomy FK validation', () => {
  it('rejects when event_category_id does not exist', async () => {
    (EventCategory.findByPk as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp()).post('/events').send(baseValid);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid event_category_id/);
  });

  it('rejects when activity_area_id does not exist', async () => {
    (ActivityArea.findByPk as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp()).post('/events').send(baseValid);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid activity_area_id/);
  });

  it('attributes the new event to the current user (no spoofing via body)', async () => {
    await request(buildApp())
      .post('/events')
      .send({ ...baseValid, createdByUserId: 9999 }); // try to spoof

    expect(Event.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdByUserId: 99 }),
    );
  });
});

describe('PATCH /events/:id — owner-only edits', () => {
  it('returns 404 when the event belongs to another employer', async () => {
    const { APIError } = require('@monkeytech/nodejs-core/api/errors/APIError');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadOwnedEvent } = require('../app/api/helpers/events');
    (loadOwnedEvent as jest.Mock).mockRejectedValue(new APIError(404, 'Event not found'));

    const res = await request(buildApp())
      .patch('/events/7')
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('rejects edits to a cancelled event', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadOwnedEvent } = require('../app/api/helpers/events');
    (loadOwnedEvent as jest.Mock).mockResolvedValue({
      id: 7,
      status: 'cancelled',
      startAt: new Date('2026-07-01T10:00:00Z'),
      endAt: new Date('2026-07-01T18:00:00Z'),
      update: jest.fn(),
    });

    const res = await request(buildApp())
      .patch('/events/7')
      .send({ name: 'Renamed' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cancelled/);
  });
});

describe('GET /events — listing only includes the current employer', () => {
  it('queries with createdByUserId = current user', async () => {
    (Event.findAndCountAll as jest.Mock).mockResolvedValue({ rows: [], count: 0 });

    await request(buildApp()).get('/events');

    expect(Event.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdByUserId: 99 }),
      }),
    );
  });
});
