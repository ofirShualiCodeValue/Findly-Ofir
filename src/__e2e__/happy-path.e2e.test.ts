// End-to-end smoke test for the critical path:
//   employer signup → create event → employee signup → apply → approve → cancel.
//
// This single test exercises the full HTTP surface (not handler-level mocks):
// real DB, real JWT, real auth middleware, real Sequelize associations.
// If this fails, *something* in the integration is broken.

import { resetUserData, closeDb } from './helpers/db';
import {
  api,
  signupAsEmployer,
  signupAsEmployee,
} from './helpers/api';

beforeEach(async () => {
  await resetUserData();
});

afterAll(async () => {
  await closeDb();
});

describe('happy path: employer ↔ employee full flow', () => {
  it('runs the full lifecycle without error', async () => {
    // ────────────── 1. Employer signs up ──────────────
    const employer = await signupAsEmployer('+972500000001', 'אופיר המעסיק');
    expect(employer.user.role).toBe('employer');
    expect(employer.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    // ────────────── 2. Employer fetches taxonomy to get IDs for event creation ──────────────
    const categoriesRes = await employer.request().get('/v1/shared/categories');
    expect(categoriesRes.status).toBe(200);
    const categoryId = categoriesRes.body.data[0].id;
    expect(typeof categoryId).toBe('number');

    const areasRes = await employer.request().get('/v1/shared/areas');
    expect(areasRes.status).toBe(200);
    const areaId = areasRes.body.data[0].id;

    // ────────────── 3. Employer creates an event ──────────────
    const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 8 * 60 * 60 * 1000);
    const createRes = await employer.request()
      .post('/v1/employer/events')
      .send({
        name: 'חתונה במלון רוטשילד',
        description: 'שירותי קייטרינג מלאים',
        venue: 'מלון רוטשילד, תל אביב',
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        budget: '50000',
        required_employees: 5,
        event_category_id: categoryId,
        activity_area_id: areaId,
        status: 'active',
      });
    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id;
    expect(typeof eventId).toBe('number');
    expect(createRes.body.data.status).toBe('active');

    // ────────────── 4. Employer's own event list shows it ──────────────
    const listOwnRes = await employer.request().get('/v1/employer/events');
    expect(listOwnRes.status).toBe(200);
    expect(listOwnRes.body.data.length).toBe(1);
    expect(listOwnRes.body.data[0].id).toBe(eventId);

    // ────────────── 5. Employee signs up ──────────────
    const employee = await signupAsEmployee('+972500000002', 'דנה העובדת');
    expect(employee.user.role).toBe('employee');

    // ────────────── 6. Employee browses events (match=off bypasses location/skill match) ──────────────
    const browseRes = await employee.request().get('/v1/employee/events?match=off');
    expect(browseRes.status).toBe(200);
    const visibleEvent = browseRes.body.data.find((e: { id: number }) => e.id === eventId);
    expect(visibleEvent).toBeDefined();

    // ────────────── 7. Employee applies to the event ──────────────
    const applyRes = await employee.request()
      .post(`/v1/employee/events/${eventId}/apply`)
      .send({ proposed_amount: 1500, note: 'זמינה לאורך כל המשמרת' });
    expect([200, 201]).toContain(applyRes.status);
    const applicationId = applyRes.body.data.id;
    expect(applyRes.body.data.status).toBe('pending');

    // ────────────── 8. Employer sees the application ──────────────
    const appsRes = await employer.request().get(`/v1/employer/events/${eventId}/applications`);
    expect(appsRes.status).toBe(200);
    expect(appsRes.body.data.length).toBe(1);
    expect(appsRes.body.data[0].id).toBe(applicationId);
    expect(appsRes.body.data[0].status).toBe('pending');

    // ────────────── 9. Employer approves the application ──────────────
    const decideRes = await employer.request()
      .patch(`/v1/employer/events/${eventId}/applications/${applicationId}`)
      .send({ status: 'approved', note: 'מעולה!' });
    expect(decideRes.status).toBe(200);

    // ────────────── 10. Employee sees the approval in their list ──────────────
    const myAppsRes = await employee.request().get('/v1/employee/applications');
    expect(myAppsRes.status).toBe(200);
    expect(myAppsRes.body.data.length).toBe(1);
    expect(myAppsRes.body.data[0].status).toBe('approved');

    // ────────────── 11. Employer cancels the event ──────────────
    const cancelRes = await employer.request().delete(`/v1/employer/events/${eventId}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');

    // ────────────── 12. Cancelled event no longer appears in employee feed ──────────────
    const browseAfterRes = await employee.request().get('/v1/employee/events?match=off');
    expect(browseAfterRes.status).toBe(200);
    const stillVisible = browseAfterRes.body.data.find((e: { id: number }) => e.id === eventId);
    expect(stillVisible).toBeUndefined();
  });

  it('rejects employee trying to access employer-only routes', async () => {
    const employee = await signupAsEmployee('+972500000099', 'בודק');
    const res = await employee.request().get('/v1/employer/events');
    expect(res.status).toBe(403);
  });

  it('rejects requests without a JWT', async () => {
    const res = await api().get('/v1/employer/events');
    expect(res.status).toBe(401);
  });
});
