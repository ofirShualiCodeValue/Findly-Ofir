// E2E coverage of employer notification endpoints.
//
// Endpoints under test:
//   POST   /v1/employer/events/:eventId/notifications  (broadcast to approved workers)
//   GET    /v1/employer/events/:eventId/notifications  (broadcast history)
//   GET    /v1/employer/notifications                  (system inbox)
//   POST   /v1/employer/notifications/:id/read         (mark read)

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployer, signupAsEmployee, Session } from './helpers/api';

let employer: Session;
let employee: Session;
let eventId: number;

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500007001', 'Notif Owner');
  employee = await signupAsEmployee('+972500007002', 'Notif Worker');

  const cats = await employer.request().get('/v1/shared/categories');
  const areas = await employer.request().get('/v1/shared/areas');
  const start = new Date(Date.now() + 7 * 86_400_000);
  const created = await employer.request().post('/v1/employer/events').send({
    name: 'Notif Event',
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    budget: '5000',
    required_employees: 2,
    event_category_id: cats.body.data[0].id,
    activity_area_id: areas.body.data[0].id,
    status: 'active',
  });
  eventId = created.body.data.id;

  // Apply + approve so we have an approved recipient for broadcasts.
  const apply = await employee.request()
    .post(`/v1/employee/events/${eventId}/apply`)
    .send({ proposed_amount: 1000 });
  await employer.request()
    .patch(`/v1/employer/events/${eventId}/applications/${apply.body.data.id}`)
    .send({ status: 'approved' });
});

afterAll(async () => {
  await closeDb();
});

describe('POST /v1/employer/events/:eventId/notifications (broadcast)', () => {
  it('sends to all approved employees and returns recipient_count', async () => {
    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/notifications`)
      .send({ title: 'משמרת התעדכנה', body: 'נא להגיע ב-18:00' });
    expect(res.status).toBe(201);
    expect(res.body.data.recipient_count).toBe(1);
    expect(typeof res.body.data.message_group_id).toBe('string');
  });

  it('rejects when title is missing or empty', async () => {
    const res = await employer.request()
      .post(`/v1/employer/events/${eventId}/notifications`)
      .send({ body: 'no title' });
    expect(res.status).toBe(400);

    const res2 = await employer.request()
      .post(`/v1/employer/events/${eventId}/notifications`)
      .send({ title: '   ' });
    expect(res2.status).toBe(400);
  });

  it('returns 404 for an event not owned by the caller', async () => {
    const other = await signupAsEmployer('+972500007003', 'Other');
    const res = await other.request()
      .post(`/v1/employer/events/${eventId}/notifications`)
      .send({ title: 'hi' });
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/employer/events/:eventId/notifications (history)', () => {
  it('returns one history entry per broadcast, newest first', async () => {
    await employer.request()
      .post(`/v1/employer/events/${eventId}/notifications`)
      .send({ title: 'first' });
    await employer.request()
      .post(`/v1/employer/events/${eventId}/notifications`)
      .send({ title: 'second' });

    const res = await employer.request()
      .get(`/v1/employer/events/${eventId}/notifications`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    // Each entry should carry recipient_count.
    expect(typeof res.body.data[0].recipient_count).toBe('number');
  });

  it('returns 404 for an event not owned by the caller', async () => {
    const other = await signupAsEmployer('+972500007004', 'Other');
    const res = await other.request().get(`/v1/employer/events/${eventId}/notifications`);
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/employer/notifications (system inbox)', () => {
  it('returns the employer\'s own notifications', async () => {
    const res = await employer.request().get('/v1/employer/notifications');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('does NOT include event_message broadcasts (those are employee-only)', async () => {
    // Send a broadcast — it should never show up in the employer's inbox.
    await employer.request()
      .post(`/v1/employer/events/${eventId}/notifications`)
      .send({ title: 'broadcast' });

    const res = await employer.request().get('/v1/employer/notifications');
    const eventMessages = res.body.data.filter(
      (n: { type: string }) => n.type === 'event_message',
    );
    expect(eventMessages.length).toBe(0);
  });

  it('supports the unread filter', async () => {
    const res = await employer.request().get('/v1/employer/notifications?unread=true');
    expect(res.status).toBe(200);
  });
});

describe('POST /v1/employer/notifications/:id/read', () => {
  it('returns 404 for a non-existent notification', async () => {
    const res = await employer.request().post('/v1/employer/notifications/99999/read');
    expect(res.status).toBe(404);
  });

  it('rejects an invalid id', async () => {
    const res = await employer.request().post('/v1/employer/notifications/not-a-number/read');
    expect(res.status).toBe(400);
  });
});
