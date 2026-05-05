// E2E coverage of /v1/employee/events/*.
//
// Endpoints under test:
//   GET    /v1/employee/events            (?tab=offers|shifts, ?match=on|off)
//   GET    /v1/employee/events/:id
//   POST   /v1/employee/events/:id/interest

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployer, signupAsEmployee, Session } from './helpers/api';

let employer: Session;
let employee: Session;
let categoryId: number;
let areaId: number;

const futureStart = (daysAhead = 7): Date =>
  new Date(Date.now() + daysAhead * 86_400_000);

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500009001', 'Browse Owner');
  employee = await signupAsEmployee('+972500009002', 'Browser');

  const cats = await employer.request().get('/v1/shared/categories');
  const areas = await employer.request().get('/v1/shared/areas');
  categoryId = cats.body.data[0].id;
  areaId = areas.body.data[0].id;
});

afterAll(async () => {
  await closeDb();
});

async function createEvent(name = 'E', status = 'active'): Promise<number> {
  const start = futureStart();
  const res = await employer.request().post('/v1/employer/events').send({
    name,
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    budget: '10000',
    required_employees: 5,
    event_category_id: categoryId,
    activity_area_id: areaId,
    status,
  });
  return res.body.data.id;
}

describe('GET /v1/employee/events?tab=offers (default)', () => {
  it('returns active future events when match=off', async () => {
    await createEvent('Offer 1');
    await createEvent('Offer 2');
    const res = await employee.request().get('/v1/employee/events?match=off');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('does NOT return draft events', async () => {
    await createEvent('Draft Event', 'draft');
    const res = await employee.request().get('/v1/employee/events?match=off');
    expect(res.body.data.length).toBe(0);
  });

  it('does NOT return cancelled events', async () => {
    const id = await createEvent('Cancelled Event');
    await employer.request().delete(`/v1/employer/events/${id}`);
    const res = await employee.request().get('/v1/employee/events?match=off');
    expect(res.body.data.length).toBe(0);
  });

  it('does NOT return events the employee already applied to', async () => {
    const id = await createEvent('Already Applied');
    await employee.request()
      .post(`/v1/employee/events/${id}/apply`)
      .send({ proposed_amount: 500 });
    const res = await employee.request().get('/v1/employee/events');
    expect(res.body.data.find((e: { id: number }) => e.id === id)).toBeUndefined();
  });

  it('does NOT return events the employee dismissed (interest=not_interested)', async () => {
    const id = await createEvent('Dismissed');
    await employee.request()
      .post(`/v1/employee/events/${id}/interest`)
      .send({ status: 'not_interested' });
    const res = await employee.request().get('/v1/employee/events');
    expect(res.body.data.find((e: { id: number }) => e.id === id)).toBeUndefined();
  });

  it('returns the dismissed event again when match=off', async () => {
    const id = await createEvent('Dismissed but match=off');
    await employee.request()
      .post(`/v1/employee/events/${id}/interest`)
      .send({ status: 'not_interested' });
    const res = await employee.request().get('/v1/employee/events?match=off');
    expect(res.body.data.find((e: { id: number }) => e.id === id)).toBeDefined();
  });
});

describe('GET /v1/employee/events?tab=shifts', () => {
  it('returns events the employee has applied to (any status)', async () => {
    const id1 = await createEvent('Applied 1');
    const id2 = await createEvent('Applied 2');
    await employee.request().post(`/v1/employee/events/${id1}/apply`).send({ proposed_amount: 500 });
    await employee.request().post(`/v1/employee/events/${id2}/apply`).send({ proposed_amount: 700 });

    const res = await employee.request().get('/v1/employee/events?tab=shifts');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('returns empty list when no applications', async () => {
    const res = await employee.request().get('/v1/employee/events?tab=shifts');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /v1/employee/events/:id', () => {
  it('returns details for an active event', async () => {
    const id = await createEvent('Detail');
    const res = await employee.request().get(`/v1/employee/events/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await employee.request().get('/v1/employee/events/99999');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-active event (e.g. draft)', async () => {
    const id = await createEvent('Draft', 'draft');
    const res = await employee.request().get(`/v1/employee/events/${id}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/employee/events/:id/interest', () => {
  it('records a not_interested status', async () => {
    const id = await createEvent('Interest Event');
    const res = await employee.request()
      .post(`/v1/employee/events/${id}/interest`)
      .send({ status: 'not_interested' });
    expect(res.status).toBe(200);
    expect(res.body.data.event_id).toBe(id);
    expect(res.body.data.status).toBe('not_interested');
  });

  it('is idempotent (upsert)', async () => {
    const id = await createEvent('Interest Idempotent');
    await employee.request()
      .post(`/v1/employee/events/${id}/interest`)
      .send({ status: 'not_interested' });
    const res = await employee.request()
      .post(`/v1/employee/events/${id}/interest`)
      .send({ status: 'interested' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('interested');
  });

  it('rejects an unknown status', async () => {
    const id = await createEvent('Bad Status');
    const res = await employee.request()
      .post(`/v1/employee/events/${id}/interest`)
      .send({ status: 'maybe' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await employee.request()
      .post('/v1/employee/events/99999/interest')
      .send({ status: 'interested' });
    expect(res.status).toBe(404);
  });
});
