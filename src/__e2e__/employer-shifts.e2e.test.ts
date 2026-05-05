// E2E coverage of /v1/employer/events/:eventId/shifts.
//
// Endpoints under test:
//   GET     /v1/employer/events/:eventId/shifts
//   POST    /v1/employer/events/:eventId/shifts
//   PATCH   /v1/employer/events/:eventId/shifts/:id
//   DELETE  /v1/employer/events/:eventId/shifts/:id

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployer, Session } from './helpers/api';

let employer: Session;
let eventId: number;
let subCatA: number;
let subCatB: number | undefined;

const futureStart = (daysAhead = 7): Date =>
  new Date(Date.now() + daysAhead * 86_400_000);

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500004001', 'Shift Owner');

  const cats = await employer.request().get('/v1/shared/categories');
  const areas = await employer.request().get('/v1/shared/areas');
  const inds = await employer.request().get('/v1/shared/industries');
  const firstInd = inds.body.data.find(
    (i: { sub_categories: unknown[] }) => i.sub_categories.length >= 1,
  );
  subCatA = firstInd.sub_categories[0].id;
  subCatB = firstInd.sub_categories[1]?.id;

  const eventStart = futureStart();
  const eventEnd = new Date(eventStart.getTime() + 24 * 60 * 60 * 1000);
  const created = await employer.request().post('/v1/employer/events').send({
    name: 'Shifts Event',
    start_at: eventStart.toISOString(),
    end_at: eventEnd.toISOString(),
    budget: '20000',
    required_employees: 10,
    event_category_id: cats.body.data[0].id,
    activity_area_id: areas.body.data[0].id,
    status: 'active',
  });
  eventId = created.body.data.id;
});

afterAll(async () => {
  await closeDb();
});

function shiftBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const start = futureStart();
  return {
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    contact_person_name: 'Manager',
    contact_person_phone: '+972500009999',
    notes: 'arrive at 5pm',
    ...overrides,
  };
}

describe('POST /v1/employer/events/:eventId/shifts', () => {
  it('creates a shift with no staffing requirements', async () => {
    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody());
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.id).toEqual(expect.any(Number));
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.staffing_requirements).toEqual([]);
  });

  it('creates a shift with staffing requirements', async () => {
    const reqs = [{ industry_subcategory_id: subCatA, required_count: 3 }];
    if (subCatB) reqs.push({ industry_subcategory_id: subCatB, required_count: 2 });

    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody({ staffing_requirements: reqs }));
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.staffing_requirements.length).toBe(reqs.length);
  });

  it('rejects shift duration < 6 hours', async () => {
    const start = futureStart();
    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody({
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      }));
    expect(res.status).toBe(400);
  });

  it('rejects shift duration > 12 hours', async () => {
    const start = futureStart();
    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody({
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + 13 * 60 * 60 * 1000).toISOString(),
      }));
    expect(res.status).toBe(400);
  });

  it('rejects duplicate industry_subcategory_id in staffing', async () => {
    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody({
        staffing_requirements: [
          { industry_subcategory_id: subCatA, required_count: 1 },
          { industry_subcategory_id: subCatA, required_count: 2 },
        ],
      }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/duplicate/i);
  });

  it('rejects required_count < 1', async () => {
    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody({
        staffing_requirements: [
          { industry_subcategory_id: subCatA, required_count: 0 },
        ],
      }));
    expect(res.status).toBe(400);
  });

  it('rejects when start_at or end_at missing', async () => {
    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send({ contact_person_name: 'X' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an event owned by a different employer', async () => {
    const other = await signupAsEmployer('+972500004002', 'Other');
    const res = await other.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody());
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/employer/events/:eventId/shifts', () => {
  it('returns all shifts for the event, sorted by start_at ASC', async () => {
    const shift1Start = futureStart(7);
    const shift2Start = futureStart(8);
    await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody({
        start_at: shift2Start.toISOString(),
        end_at: new Date(shift2Start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
      }));
    await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody({
        start_at: shift1Start.toISOString(),
        end_at: new Date(shift1Start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
      }));

    const res = await employer.request().get(`/v1/employer/events/${eventId}/shifts`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);

    const starts = res.body.data.map(
      (s: { start_at: string }) => new Date(s.start_at).getTime(),
    );
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sorted);
  });

  it('returns empty list when event has no shifts', async () => {
    const res = await employer.request().get(`/v1/employer/events/${eventId}/shifts`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 404 for an event not owned by the caller', async () => {
    const other = await signupAsEmployer('+972500004003', 'Other');
    const res = await other.request().get(`/v1/employer/events/${eventId}/shifts`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/employer/events/:eventId/shifts/:id', () => {
  let shiftId: number;
  beforeEach(async () => {
    const created = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody());
    shiftId = created.body.data.id;
  });

  it('updates contact_person_name', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/shifts/${shiftId}`)
      .send({ contact_person_name: 'New Manager' });
    expect(res.status).toBe(200);
    expect(res.body.data.contact_person_name).toBe('New Manager');
  });

  it('rejects update that would push duration outside 6–12h window', async () => {
    const newStart = futureStart();
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/shifts/${shiftId}`)
      .send({
        start_at: newStart.toISOString(),
        end_at: new Date(newStart.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent shift', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/shifts/99999`)
      .send({ notes: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/employer/events/:eventId/shifts/:id', () => {
  it('soft-cancels a shift (status → cancelled)', async () => {
    const created = await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send(shiftBody());
    const shiftId = created.body.data.id;

    const res = await employer.request()
      .delete(`/v1/employer/events/${eventId}/shifts/${shiftId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('returns 404 for non-existent shift', async () => {
    const res = await employer.request()
      .delete(`/v1/employer/events/${eventId}/shifts/99999`);
    expect(res.status).toBe(404);
  });
});
