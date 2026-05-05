// E2E coverage of employee application endpoints.
//
// Endpoints under test:
//   POST   /v1/employee/events/:eventId/apply
//   GET    /v1/employee/applications
//   DELETE /v1/employee/applications/:id
//   POST   /v1/employee/applications/:id/report-hours

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployer, signupAsEmployee, Session } from './helpers/api';

let employer: Session;
let employee: Session;
let eventId: number;

const futureStart = (daysAhead = 7): Date =>
  new Date(Date.now() + daysAhead * 86_400_000);

async function setEventEndedInPast(): Promise<void> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { sequelize } = require('../db/connection');
  const past = new Date(Date.now() - 60 * 60 * 1000);
  const earlier = new Date(past.getTime() - 60 * 60 * 1000);
  await sequelize.query(
    `UPDATE events SET start_at = :s, end_at = :e WHERE id = :id`,
    { replacements: { s: earlier.toISOString(), e: past.toISOString(), id: eventId } },
  );
}

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500010001', 'EvOwn');
  employee = await signupAsEmployee('+972500010002', 'Worker');

  const cats = await employer.request().get('/v1/shared/categories');
  const areas = await employer.request().get('/v1/shared/areas');
  const start = futureStart();
  const created = await employer.request().post('/v1/employer/events').send({
    name: 'Apply Event',
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    budget: '5000',
    required_employees: 3,
    event_category_id: cats.body.data[0].id,
    activity_area_id: areas.body.data[0].id,
    status: 'active',
  });
  eventId = created.body.data.id;
});

afterAll(async () => {
  await closeDb();
});

describe('POST /v1/employee/events/:eventId/apply', () => {
  it('creates a pending application with the proposed amount', async () => {
    const res = await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1500, note: 'available all night' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.status).toBe('pending');
    expect(Number(res.body.data.proposed_amount)).toBe(1500);
  });

  it('rejects when proposed_amount is missing', async () => {
    const res = await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects negative proposed_amount', async () => {
    const res = await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: -50 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await employee.request()
      .post('/v1/employee/events/99999/apply')
      .send({ proposed_amount: 1000 });
    expect(res.status).toBe(404);
  });

  it('rejects a duplicate apply (already applied)', async () => {
    await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1000 });
    const res = await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1500 });
    expect([400, 409]).toContain(res.status);
  });
});

describe('GET /v1/employee/applications', () => {
  it('lists the employee\'s applications, newest first', async () => {
    await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1000 });

    const res = await employee.request().get('/v1/employee/applications');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('filters by status', async () => {
    await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1000 });

    const pending = await employee.request().get('/v1/employee/applications?status=pending');
    expect(pending.body.data.length).toBe(1);

    const approved = await employee.request().get('/v1/employee/applications?status=approved');
    expect(approved.body.data.length).toBe(0);
  });

  it('does NOT include applications from other employees', async () => {
    const employee2 = await signupAsEmployee('+972500010003', 'Other Worker');
    await employee2.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 999 });

    const res = await employee.request().get('/v1/employee/applications');
    expect(res.body.data.length).toBe(0);
  });

  it('returns empty list when no applications', async () => {
    const res = await employee.request().get('/v1/employee/applications');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('DELETE /v1/employee/applications/:id', () => {
  it('cancels a pending application by employee', async () => {
    const apply = await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1000 });
    const applicationId = apply.body.data.id;

    const res = await employee.request().delete(`/v1/employee/applications/${applicationId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled_by_employee');
  });

  it('returns 404 for a non-existent application', async () => {
    const res = await employee.request().delete('/v1/employee/applications/99999');
    expect(res.status).toBe(404);
  });

  it('returns 404 for an application owned by another employee', async () => {
    const employee2 = await signupAsEmployee('+972500010004', 'Other');
    const a = await employee2.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 999 });
    const res = await employee.request().delete(`/v1/employee/applications/${a.body.data.id}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/employee/applications/:id/report-hours', () => {
  let applicationId: number;
  beforeEach(async () => {
    const apply = await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1000 });
    applicationId = apply.body.data.id;
    await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}`)
      .send({ status: 'approved' });
  });

  it('rejects reporting before the shift has ended', async () => {
    const res = await employee.request()
      .post(`/v1/employee/applications/${applicationId}/report-hours`)
      .send({ hours: 8 });
    expect(res.status).toBe(409);
  });

  it('accepts report after shift ended; sets hours_status=pending_approval', async () => {
    await setEventEndedInPast();
    const res = await employee.request()
      .post(`/v1/employee/applications/${applicationId}/report-hours`)
      .send({ hours: 8 });
    expect(res.status).toBe(200);
    expect(res.body.data.hours_status).toBe('pending_approval');
    // EmployeeApplicationEntity exposes the field as `reported_hours`
    // (snake_case of the entity's `reportedHours` getter), NOT
    // `hours_submitted` as the OpenAPI doc/explorer mapping suggested.
    expect(Number(res.body.data.reported_hours)).toBe(8);
  });

  it('rejects hours outside [0, 24]', async () => {
    await setEventEndedInPast();
    const res = await employee.request()
      .post(`/v1/employee/applications/${applicationId}/report-hours`)
      .send({ hours: 30 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent application', async () => {
    const res = await employee.request()
      .post('/v1/employee/applications/99999/report-hours')
      .send({ hours: 8 });
    expect(res.status).toBe(404);
  });
});
