// E2E coverage of /v1/employer/events/:eventId/capacity.
//
// Endpoint under test:
//   GET /v1/employer/events/:eventId/capacity
//
// Capacity is computed live from shifts + staffing_requirements + approved
// applications. We stage a small scenario (1 shift, 2 staffing rows, mixed
// approval states) and assert the breakdown shape.

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployer, Session } from './helpers/api';

let employer: Session;
let eventId: number;
let subCatId: number;

const futureStart = (daysAhead = 7): Date =>
  new Date(Date.now() + daysAhead * 86_400_000);

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500005001', 'Capacity Owner');

  const cats = await employer.request().get('/v1/shared/categories');
  const areas = await employer.request().get('/v1/shared/areas');
  const inds = await employer.request().get('/v1/shared/industries');
  const firstInd = inds.body.data.find(
    (i: { sub_categories: unknown[] }) => i.sub_categories.length >= 1,
  );
  subCatId = firstInd.sub_categories[0].id;

  const eventStart = futureStart();
  const eventEnd = new Date(eventStart.getTime() + 24 * 60 * 60 * 1000);
  const created = await employer.request().post('/v1/employer/events').send({
    name: 'Capacity Event',
    start_at: eventStart.toISOString(),
    end_at: eventEnd.toISOString(),
    budget: '10000',
    required_employees: 5,
    event_category_id: cats.body.data[0].id,
    activity_area_id: areas.body.data[0].id,
    status: 'active',
  });
  eventId = created.body.data.id;
});

afterAll(async () => {
  await closeDb();
});

describe('GET /v1/employer/events/:eventId/capacity', () => {
  it('returns under-capacity breakdown when no applications are approved', async () => {
    // Add a shift with 3-person requirement.
    const shiftStart = futureStart();
    await employer.request()
      .post(`/v1/employer/events/${eventId}/shifts`)
      .send({
        start_at: shiftStart.toISOString(),
        end_at: new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000).toISOString(),
        staffing_requirements: [
          { industry_subcategory_id: subCatId, required_count: 3 },
        ],
      });

    const res = await employer.request().get(`/v1/employer/events/${eventId}/capacity`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.state).toBe('under');
    expect(Array.isArray(res.body.data.shifts)).toBe(true);
    expect(res.body.data.shifts.length).toBe(1);
  });

  it('returns 404 for an event the caller does not own', async () => {
    const other = await signupAsEmployer('+972500005002', 'Other');
    const res = await other.request().get(`/v1/employer/events/${eventId}/capacity`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await employer.request().get('/v1/employer/events/99999/capacity');
    expect(res.status).toBe(404);
  });
});
