// Security-focused E2E tests: isolation between employers, between
// employees, and across roles. These guard the most critical class of
// data leakage — employer A reading employer B's events, applications,
// or sending notifications on their behalf.
//
// All assertions must fail CLOSED (404 or 403). A 200 here is a real bug.

import { resetUserData, closeDb } from './helpers/db';
import { api, signupAsEmployer, signupAsEmployee, Session } from './helpers/api';

let employerA: Session;
let employerB: Session;
let employeeA: Session;
let employeeB: Session;
let eventA: number;     // owned by employerA
let appByEmployeeA: number; // employeeA applying to eventA
let categoryId: number;
let areaId: number;

const futureStart = (daysAhead = 7): Date =>
  new Date(Date.now() + daysAhead * 86_400_000);

beforeEach(async () => {
  await resetUserData();
  employerA = await signupAsEmployer('+972500012001', 'Employer A');
  employerB = await signupAsEmployer('+972500012002', 'Employer B');
  employeeA = await signupAsEmployee('+972500012003', 'Employee A');
  employeeB = await signupAsEmployee('+972500012004', 'Employee B');

  const cats = await employerA.request().get('/v1/shared/categories');
  const areas = await employerA.request().get('/v1/shared/areas');
  categoryId = cats.body.data[0].id;
  areaId = areas.body.data[0].id;

  const start = futureStart();
  const created = await employerA.request().post('/v1/employer/events').send({
    name: 'A\'s Event',
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    budget: '5000',
    required_employees: 2,
    event_category_id: categoryId,
    activity_area_id: areaId,
    status: 'active',
  });
  eventA = created.body.data.id;

  const apply = await employeeA.request()
    .post(`/v1/employee/events/${eventA}/apply`)
    .send({ proposed_amount: 1000 });
  appByEmployeeA = apply.body.data.id;
});

afterAll(async () => {
  await closeDb();
});

describe('Cross-employer event isolation', () => {
  it('Employer B sees an empty list (only A owns events)', async () => {
    const res = await employerB.request().get('/v1/employer/events');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('Employer B GET on A\'s event → 404', async () => {
    const res = await employerB.request().get(`/v1/employer/events/${eventA}`);
    expect(res.status).toBe(404);
  });

  it('Employer B PATCH on A\'s event → 404', async () => {
    const res = await employerB.request()
      .patch(`/v1/employer/events/${eventA}`)
      .send({ name: 'pwned' });
    expect(res.status).toBe(404);
    // Sanity: A's event name is unchanged.
    const after = await employerA.request().get(`/v1/employer/events/${eventA}`);
    expect(after.body.data.name).toBe('A\'s Event');
  });

  it('Employer B DELETE on A\'s event → 404', async () => {
    const res = await employerB.request().delete(`/v1/employer/events/${eventA}`);
    expect(res.status).toBe(404);
    // Sanity: A's event is still active.
    const after = await employerA.request().get(`/v1/employer/events/${eventA}`);
    expect(after.body.data.status).toBe('active');
  });
});

describe('Cross-employer application + shifts isolation', () => {
  it('Employer B GET on A\'s applications list → 404', async () => {
    const res = await employerB.request().get(`/v1/employer/events/${eventA}/applications`);
    expect(res.status).toBe(404);
  });

  it('Employer B GET on A\'s applicant detail → 404', async () => {
    const res = await employerB.request()
      .get(`/v1/employer/events/${eventA}/applications/${appByEmployeeA}`);
    expect(res.status).toBe(404);
  });

  it('Employer B PATCH (decide) on A\'s application → 404', async () => {
    const res = await employerB.request()
      .patch(`/v1/employer/events/${eventA}/applications/${appByEmployeeA}`)
      .send({ status: 'approved' });
    expect(res.status).toBe(404);
    // Sanity: application is still pending from A's side.
    const list = await employerA.request().get(`/v1/employer/events/${eventA}/applications`);
    expect(list.body.data[0].status).toBe('pending');
  });

  it('Employer B PUT rating on A\'s application → 404', async () => {
    const res = await employerB.request()
      .put(`/v1/employer/events/${eventA}/applications/${appByEmployeeA}/rating`)
      .send({ rating: 1, comment: 'sabotage' });
    expect(res.status).toBe(404);
  });

  it('Employer B GET on A\'s shifts → 404', async () => {
    const res = await employerB.request().get(`/v1/employer/events/${eventA}/shifts`);
    expect(res.status).toBe(404);
  });

  it('Employer B POST shift on A\'s event → 404', async () => {
    const start = futureStart();
    const res = await employerB.request()
      .post(`/v1/employer/events/${eventA}/shifts`)
      .send({
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
      });
    expect(res.status).toBe(404);
  });

  it('Employer B GET capacity for A\'s event → 404', async () => {
    const res = await employerB.request().get(`/v1/employer/events/${eventA}/capacity`);
    expect(res.status).toBe(404);
  });

  it('Employer B POST broadcast on A\'s event → 404', async () => {
    const res = await employerB.request()
      .post(`/v1/employer/events/${eventA}/notifications`)
      .send({ title: 'fake' });
    expect(res.status).toBe(404);
  });

  it('Employer B GET broadcast history of A\'s event → 404', async () => {
    const res = await employerB.request().get(`/v1/employer/events/${eventA}/notifications`);
    expect(res.status).toBe(404);
  });
});

describe('Cross-employee application isolation', () => {
  it('Employee B does not see Employee A\'s applications', async () => {
    const res = await employeeB.request().get('/v1/employee/applications');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it('Employee B cannot cancel Employee A\'s application', async () => {
    const res = await employeeB.request().delete(`/v1/employee/applications/${appByEmployeeA}`);
    expect(res.status).toBe(404);
    // Sanity: A's application is still pending.
    const list = await employeeA.request().get('/v1/employee/applications');
    expect(list.body.data[0].status).toBe('pending');
  });

  it('Employee B cannot report hours on Employee A\'s application', async () => {
    const res = await employeeB.request()
      .post(`/v1/employee/applications/${appByEmployeeA}/report-hours`)
      .send({ hours: 8 });
    expect(res.status).toBe(404);
  });
});

describe('Cross-role authorization (defense in depth)', () => {
  it('Employee cannot use any /v1/employer/* route', async () => {
    const r1 = await employeeA.request().get('/v1/employer/events');
    const r2 = await employeeA.request().get('/v1/employer/profile');
    const r3 = await employeeA.request().get(`/v1/employer/events/${eventA}/applications`);
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
    expect(r3.status).toBe(403);
  });

  it('Employer cannot use any /v1/employee/* route', async () => {
    const r1 = await employerA.request().get('/v1/employee/events');
    const r2 = await employerA.request().get('/v1/employee/applications');
    const r3 = await employerA.request().get('/v1/employee/profile');
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
    expect(r3.status).toBe(403);
  });
});

describe('Unauthenticated baseline', () => {
  it('Every protected route 401s without a token', async () => {
    const routes = [
      '/v1/employer/profile',
      '/v1/employer/events',
      '/v1/employer/notifications',
      '/v1/employee/profile',
      '/v1/employee/applications',
      '/v1/employee/notifications',
      '/v1/shared/areas',
      '/v1/shared/categories',
      '/v1/shared/industries',
      '/v1/shared/certifications',
    ];
    for (const r of routes) {
      const res = await api().get(r);
      expect(res.status).toBe(401);
    }
  });
});
