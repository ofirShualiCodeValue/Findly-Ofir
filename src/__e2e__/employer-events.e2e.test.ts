// E2E coverage of /v1/employer/events/* (event CRUD).
//
// Endpoints under test:
//   POST    /v1/employer/events
//   GET     /v1/employer/events
//   GET     /v1/employer/events/:id
//   PATCH   /v1/employer/events/:id
//   DELETE  /v1/employer/events/:id

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployer, Session } from './helpers/api';

let employer: Session;
let categoryId: number;
let areaId: number;

const futureStart = (offsetMs = 7 * 24 * 60 * 60 * 1000): Date =>
  new Date(Date.now() + offsetMs);
const futureEnd = (start: Date, hours = 8): Date =>
  new Date(start.getTime() + hours * 60 * 60 * 1000);

interface EventBody {
  name?: string;
  start_at?: string;
  end_at?: string;
  budget?: string;
  required_employees?: number;
  event_category_id?: number;
  activity_area_id?: number;
  status?: string;
  description?: string;
  venue?: string;
}

function eventBody(overrides: EventBody = {}): EventBody {
  const start = futureStart();
  return {
    name: 'Default Event',
    start_at: start.toISOString(),
    end_at: futureEnd(start).toISOString(),
    budget: '10000',
    required_employees: 5,
    event_category_id: categoryId,
    activity_area_id: areaId,
    status: 'active',
    ...overrides,
  };
}

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500003001', 'Events Owner');
  const cats = await employer.request().get('/v1/shared/categories');
  const areas = await employer.request().get('/v1/shared/areas');
  categoryId = cats.body.data[0].id;
  areaId = areas.body.data[0].id;
});

afterAll(async () => {
  await closeDb();
});

describe('POST /v1/employer/events', () => {
  it('creates an event and returns it with category + area eager-loaded', async () => {
    const res = await employer.request()
      .post('/v1/employer/events')
      .send(eventBody({ name: 'Test Wedding' }));
    expect(res.status).toBe(201);
    expect(res.body.data.id).toEqual(expect.any(Number));
    expect(res.body.data.name).toBe('Test Wedding');
    expect(res.body.data.status).toBe('active');
    // EventFullEntity exposes them as event_category / activity_area
    // (renderSuccess converts camelCase getters to snake_case keys).
    expect(res.body.data.event_category).toBeDefined();
    expect(res.body.data.activity_area).toBeDefined();
  });

  it('defaults status to draft when not provided', async () => {
    const body = eventBody();
    delete body.status;
    const res = await employer.request().post('/v1/employer/events').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
  });

  it('rejects when required fields missing', async () => {
    const res = await employer.request().post('/v1/employer/events').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/missing/i);
  });

  it('rejects negative budget', async () => {
    const res = await employer.request()
      .post('/v1/employer/events')
      .send(eventBody({ budget: '-100' }));
    expect(res.status).toBe(400);
  });

  it('rejects required_employees < 1', async () => {
    const res = await employer.request()
      .post('/v1/employer/events')
      .send(eventBody({ required_employees: 0 }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid date string', async () => {
    const res = await employer.request()
      .post('/v1/employer/events')
      .send(eventBody({ start_at: 'not-a-date' }));
    expect(res.status).toBe(400);
  });

  it('rejects end_at <= start_at', async () => {
    const start = futureStart();
    const res = await employer.request()
      .post('/v1/employer/events')
      .send(eventBody({
        start_at: start.toISOString(),
        end_at: start.toISOString(),
      }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid status enum', async () => {
    const res = await employer.request()
      .post('/v1/employer/events')
      .send(eventBody({ status: 'frozen' }));
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/employer/events', () => {
  it('returns only events owned by the current employer, newest first', async () => {
    // Create 3 events with staggered start times.
    for (let i = 0; i < 3; i++) {
      const start = futureStart(7 * 86_400_000 + i * 86_400_000);
      await employer.request()
        .post('/v1/employer/events')
        .send(eventBody({
          name: `Event ${i}`,
          start_at: start.toISOString(),
          end_at: futureEnd(start).toISOString(),
        }));
    }

    const res = await employer.request().get('/v1/employer/events');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);

    const starts = res.body.data.map(
      (e: { start_at: string }) => new Date(e.start_at).getTime(),
    );
    const sorted = [...starts].sort((a, b) => b - a);
    expect(starts).toEqual(sorted);
  });

  it('filters by status', async () => {
    await employer.request().post('/v1/employer/events').send(eventBody({ name: 'Active', status: 'active' }));
    await employer.request().post('/v1/employer/events').send(eventBody({ name: 'Draft', status: 'draft' }));

    const activeRes = await employer.request().get('/v1/employer/events?status=active');
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data.length).toBe(1);
    expect(activeRes.body.data[0].status).toBe('active');
  });

  it('returns X-Total / X-Page headers', async () => {
    await employer.request().post('/v1/employer/events').send(eventBody());
    const res = await employer.request().get('/v1/employer/events');
    expect(res.headers['x-total']).toBeDefined();
    expect(res.headers['x-page']).toBeDefined();
  });

  it('returns empty list when no events', async () => {
    const res = await employer.request().get('/v1/employer/events');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /v1/employer/events/:id', () => {
  it('returns the full event', async () => {
    const created = await employer.request().post('/v1/employer/events').send(eventBody({ name: 'Detail' }));
    const eventId = created.body.data.id;

    const res = await employer.request().get(`/v1/employer/events/${eventId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(eventId);
    expect(res.body.data.name).toBe('Detail');
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await employer.request().get('/v1/employer/events/99999');
    expect(res.status).toBe(404);
  });

  it('returns 404 for an event owned by a different employer', async () => {
    const other = await signupAsEmployer('+972500003002', 'Other Owner');
    const created = await other.request()
      .post('/v1/employer/events')
      .send(eventBody({ name: 'Foreign' }));
    const otherEventId = created.body.data.id;

    const res = await employer.request().get(`/v1/employer/events/${otherEventId}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/employer/events/:id', () => {
  let eventId: number;
  beforeEach(async () => {
    const created = await employer.request()
      .post('/v1/employer/events')
      .send(eventBody({ name: 'Original' }));
    eventId = created.body.data.id;
  });

  it('updates a single field', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('rejects end_at <= start_at on update', async () => {
    const sameTime = futureStart().toISOString();
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}`)
      .send({ start_at: sameTime, end_at: sameTime });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await employer.request()
      .patch('/v1/employer/events/99999')
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an event owned by another employer', async () => {
    const other = await signupAsEmployer('+972500003003', 'Other');
    const created = await other.request().post('/v1/employer/events').send(eventBody());
    const res = await employer.request()
      .patch(`/v1/employer/events/${created.body.data.id}`)
      .send({ name: 'try-update' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/employer/events/:id (soft cancel)', () => {
  it('cancels an event (status → cancelled)', async () => {
    const created = await employer.request().post('/v1/employer/events').send(eventBody());
    const eventId = created.body.data.id;

    const res = await employer.request().delete(`/v1/employer/events/${eventId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await employer.request().delete('/v1/employer/events/99999');
    expect(res.status).toBe(404);
  });
});
