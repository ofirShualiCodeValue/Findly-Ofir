// E2E coverage of /v1/employer/events/:eventId/applications.
//
// Endpoints under test:
//   GET     /v1/employer/events/:eventId/applications
//   GET     /v1/employer/events/:eventId/applications/:applicationId
//   PATCH   /v1/employer/events/:eventId/applications/:applicationId  (decide)
//   PUT     /v1/employer/events/:eventId/applications/:applicationId/rating
//
// Rating tests need the event's `end_at` to be in the past — we set future
// dates via the API and then move `end_at` backwards directly in the DB to
// simulate a finished shift.

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployer, signupAsEmployee, Session } from './helpers/api';

let employer: Session;
let employee: Session;
let eventId: number;
let applicationId: number;

async function setEventEndedInPast(): Promise<void> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { sequelize } = require('../db/connection');
  const past = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
  const earlier = new Date(past.getTime() - 60 * 60 * 1000);
  await sequelize.query(
    `UPDATE events SET start_at = :s, end_at = :e WHERE id = :id`,
    { replacements: { s: earlier.toISOString(), e: past.toISOString(), id: eventId } },
  );
}

async function approve(applId: number): Promise<void> {
  const res = await employer.request()
    .patch(`/v1/employer/events/${eventId}/applications/${applId}`)
    .send({ status: 'approved' });
  expect(res.status).toBe(200);
}

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500006001', 'Apps Owner');
  employee = await signupAsEmployee('+972500006002', 'Worker');

  const cats = await employer.request().get('/v1/shared/categories');
  const areas = await employer.request().get('/v1/shared/areas');
  const start = new Date(Date.now() + 7 * 86_400_000);
  const created = await employer.request().post('/v1/employer/events').send({
    name: 'Apps Event',
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    budget: '10000',
    required_employees: 5,
    event_category_id: cats.body.data[0].id,
    activity_area_id: areas.body.data[0].id,
    status: 'active',
  });
  eventId = created.body.data.id;

  const apply = await employee.request()
    .post(`/v1/employee/events/${eventId}/apply`)
    .send({ proposed_amount: 1500 });
  applicationId = apply.body.data.id;
});

afterAll(async () => {
  await closeDb();
});

describe('GET /v1/employer/events/:eventId/applications', () => {
  it('lists pending applications by default', async () => {
    const res = await employer.request().get(`/v1/employer/events/${eventId}/applications`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('pending');
    expect(res.body.data[0].applicant).toBeDefined();
    expect(res.body.data[0].worker_rating).toBeDefined();
  });

  it('filters by status', async () => {
    const res = await employer.request()
      .get(`/v1/employer/events/${eventId}/applications?status=approved`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('filters by min_price / max_price', async () => {
    const inRange = await employer.request()
      .get(`/v1/employer/events/${eventId}/applications?min_price=1000&max_price=2000`);
    expect(inRange.body.data.length).toBe(1);

    const outOfRange = await employer.request()
      .get(`/v1/employer/events/${eventId}/applications?min_price=2000`);
    expect(outOfRange.body.data.length).toBe(0);
  });

  it('returns 404 for an event not owned by the caller', async () => {
    const other = await signupAsEmployer('+972500006003', 'Other');
    const res = await other.request().get(`/v1/employer/events/${eventId}/applications`);
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/employer/events/:eventId/applications/:applicationId', () => {
  it('returns the full applicant payload', async () => {
    const res = await employer.request()
      .get(`/v1/employer/events/${eventId}/applications/${applicationId}`);
    expect(res.status).toBe(200);
    // The handler returns a non-entity-shaped payload; just sanity-check.
    expect(res.body.data).toBeDefined();
  });

  it('returns 404 for a non-existent application', async () => {
    const res = await employer.request()
      .get(`/v1/employer/events/${eventId}/applications/99999`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/employer/events/:eventId/applications/:applicationId (decide)', () => {
  it('approves a pending application', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}`)
      .send({ status: 'approved', note: 'Welcome!' });
    expect(res.status).toBe(200);
  });

  it('rejects a pending application', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}`)
      .send({ status: 'rejected' });
    expect(res.status).toBe(200);
  });

  it('rejects an unknown status value', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}`)
      .send({ status: 'frozen' });
    expect(res.status).toBe(400);
  });

  it('rejects a second decision after the application is already approved', async () => {
    await approve(applicationId);
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}`)
      .send({ status: 'rejected' });
    expect(res.status).toBe(400);
  });

  it('still allows the employer to record cancellation_by_employer at any state', async () => {
    await approve(applicationId);
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}`)
      .send({ status: 'cancelled_by_employer' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-existent application', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/99999`)
      .send({ status: 'approved' });
    expect(res.status).toBe(404);
  });
});

describe('PUT /v1/employer/events/:eventId/applications/:applicationId/rating', () => {
  beforeEach(async () => {
    await approve(applicationId);
    await setEventEndedInPast();
  });

  it('creates a 1–5 rating after the shift has ended', async () => {
    const res = await employer.request()
      .put(`/v1/employer/events/${eventId}/applications/${applicationId}/rating`)
      .send({ rating: 5, comment: 'מעולה' });
    expect(res.status).toBe(200);
    expect(res.body.data.worker_rating.avg).toBe(5);
    expect(res.body.data.worker_rating.count).toBe(1);
  });

  it('updates an existing rating on a second call (idempotent)', async () => {
    await employer.request()
      .put(`/v1/employer/events/${eventId}/applications/${applicationId}/rating`)
      .send({ rating: 5 });
    const res = await employer.request()
      .put(`/v1/employer/events/${eventId}/applications/${applicationId}/rating`)
      .send({ rating: 3 });
    expect(res.status).toBe(200);
    expect(res.body.data.worker_rating.count).toBe(1);
    expect(res.body.data.worker_rating.avg).toBe(3);
  });

  it('rejects a rating outside 1–5', async () => {
    const res = await employer.request()
      .put(`/v1/employer/events/${eventId}/applications/${applicationId}/rating`)
      .send({ rating: 6 });
    expect(res.status).toBe(400);
  });

  it('rejects rating an application that is not approved', async () => {
    // Re-build a fresh pending application (current one is already approved)
    const employee2 = await signupAsEmployee('+972500006004', 'Worker2');
    const a = await employee2.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1000 });
    const res = await employer.request()
      .put(`/v1/employer/events/${eventId}/applications/${a.body.data.id}/rating`)
      .send({ rating: 4 });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /v1/employer/events/:eventId/applications/:applicationId/hours', () => {
  // Drives the `hours_status` lifecycle: pending_approval → approved | rejected.
  // Setup: approve the application, end the event, employee reports a time range.
  const yesterday = (h: number, m = 0): Date => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };
  const reportedStart = yesterday(14);
  const reportedEnd = yesterday(22, 30); // 8.5 hours

  beforeEach(async () => {
    await approve(applicationId);
    await setEventEndedInPast();
    const reportRes = await employee.request()
      .post(`/v1/employee/applications/${applicationId}/report-hours`)
      .send({
        start_at: reportedStart.toISOString(),
        end_at: reportedEnd.toISOString(),
      });
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data.hours_status).toBe('pending_approval');
  });

  it('approves pending hours as-is (no edit)', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.data.hours_status).toBe('approved');
    expect(Number(res.body.data.reported_hours)).toBe(8.5);
    expect(new Date(res.body.data.reported_start_at).toISOString()).toBe(reportedStart.toISOString());
  });

  it('approves with employer-edited times (overrides what worker reported)', async () => {
    const editedStart = yesterday(14, 30); // employer says worker actually came at 14:30
    const editedEnd = yesterday(22, 0);    // and left at 22:00 — 7.5 hours
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({
        status: 'approved',
        start_at: editedStart.toISOString(),
        end_at: editedEnd.toISOString(),
      });
    expect(res.status).toBe(200);
    expect(res.body.data.hours_status).toBe('approved');
    expect(Number(res.body.data.reported_hours)).toBe(7.5);
    expect(new Date(res.body.data.reported_start_at).toISOString()).toBe(editedStart.toISOString());
    expect(new Date(res.body.data.reported_end_at).toISOString()).toBe(editedEnd.toISOString());
  });

  it('rejects edit with end before start', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({
        status: 'approved',
        start_at: yesterday(22).toISOString(),
        end_at: yesterday(14).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('rejects edit when only one of start/end is provided', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'approved', start_at: yesterday(14).toISOString() });
    expect(res.status).toBe(400);
  });

  it('rejects edit when status=rejected (edits only allowed on approval)', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({
        status: 'rejected',
        start_at: yesterday(14).toISOString(),
        end_at: yesterday(22).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it('rejects pending hours (worker can re-submit)', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'rejected' });
    expect(res.status).toBe(200);
    expect(res.body.data.hours_status).toBe('rejected');
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'maybe' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when status is missing', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects pending_approval as a target status (only approved/rejected allowed)', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'pending_approval' });
    expect(res.status).toBe(400);
  });

  it('returns 409 once hours have already been approved', async () => {
    await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'approved' });
    const second = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'rejected' });
    expect(second.status).toBe(409);
  });

  it('returns 404 for a non-existent application', async () => {
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/99999/hours`)
      .send({ status: 'approved' });
    expect(res.status).toBe(404);
  });

  it('returns 404 when the event belongs to another employer', async () => {
    const other = await signupAsEmployer('+972500006005', 'Other');
    const res = await other.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'approved' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH .../hours — when worker has not reported yet', () => {
  // Sanity: the endpoint must reject when hours_status is still 'not_reported'.
  // Separate describe because it skips the "worker reports hours" beforeEach.
  it('returns 409 if no hours have been reported yet', async () => {
    await approve(applicationId);
    await setEventEndedInPast();
    // Note: deliberately NOT calling /report-hours — hours_status stays 'not_reported'.
    const res = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}/hours`)
      .send({ status: 'approved' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/pending_approval/);
  });
});
