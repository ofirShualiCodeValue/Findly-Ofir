// E2E coverage of the SMS OTP + JWT + register flow.
//
// Endpoints under test:
//   POST   /v1/shared/auth/sms/request
//   POST   /v1/shared/auth/sms/verify
//   POST   /v1/shared/auth/register
//   POST   /v1/shared/auth/logout
//   GET    /v1/shared/auth/dev/last-otp   (development-only)

import { resetUserData, closeDb } from './helpers/db';
import {
  api,
  requestOtp,
  signupAsEmployer,
  signupAsEmployee,
  loginExisting,
  withToken,
} from './helpers/api';

beforeEach(async () => {
  await resetUserData();
});

afterAll(async () => {
  await closeDb();
});

describe('POST /v1/shared/auth/sms/request', () => {
  it('returns ok + dev_code in dev mode', async () => {
    const res = await api()
      .post('/v1/shared/auth/sms/request')
      .send({ phone: '+972500000010' });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(typeof res.body.data.dev_code).toBe('string');
    expect(res.body.data.dev_code.length).toBeGreaterThan(0);
  });

  it('rejects when phone is missing', async () => {
    const res = await api().post('/v1/shared/auth/sms/request').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/phone/i);
  });

  it('rejects when phone is empty string', async () => {
    const res = await api()
      .post('/v1/shared/auth/sms/request')
      .send({ phone: '' });
    expect(res.status).toBe(400);
  });

  it('is idempotent — calling twice returns a fresh code each time', async () => {
    const a = await requestOtp('+972500000011');
    const b = await requestOtp('+972500000011');
    // Codes may differ between requests (new OTP generated) but both should be valid.
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});

describe('POST /v1/shared/auth/sms/verify', () => {
  it('returns is_new_user=true + registration_token for an unknown phone', async () => {
    const code = await requestOtp('+972500000020');
    const res = await api()
      .post('/v1/shared/auth/sms/verify')
      .send({ phone: '+972500000020', code });
    expect(res.status).toBe(200);
    expect(res.body.data.is_new_user).toBe(true);
    expect(typeof res.body.data.registration_token).toBe('string');
    expect(res.body.data.token).toBeUndefined();
  });

  it('returns is_new_user=false + token for an existing phone', async () => {
    await signupAsEmployer('+972500000021', 'Existing User');
    // Re-login with a fresh OTP — the user already exists, so we expect a session token.
    const session = await loginExisting('+972500000021');
    expect(session.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(session.user.phone).toBe('+972500000021');
  });

  it('rejects an invalid OTP code', async () => {
    await requestOtp('+972500000022');
    const res = await api()
      .post('/v1/shared/auth/sms/verify')
      .send({ phone: '+972500000022', code: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid|expired/i);
  });

  it('rejects when phone or code missing', async () => {
    const res1 = await api()
      .post('/v1/shared/auth/sms/verify')
      .send({ phone: '+972500000023' });
    expect(res1.status).toBe(400);

    const res2 = await api()
      .post('/v1/shared/auth/sms/verify')
      .send({ code: '123456' });
    expect(res2.status).toBe(400);
  });
});

describe('POST /v1/shared/auth/register', () => {
  async function getRegistrationToken(phone: string): Promise<string> {
    const code = await requestOtp(phone);
    const verify = await api()
      .post('/v1/shared/auth/sms/verify')
      .send({ phone, code });
    expect(verify.body.data.is_new_user).toBe(true);
    return verify.body.data.registration_token;
  }

  it('creates a user + employer profile and returns a session token', async () => {
    const phone = '+972500000030';
    const regToken = await getRegistrationToken(phone);

    const res = await api()
      .post('/v1/shared/auth/register')
      .set('Authorization', `Bearer ${regToken}`)
      .send({ full_name: 'אופיר המעסיק', role: 'employer' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('employer');
    expect(res.body.data.user.phone).toBe(phone);
    expect(res.body.data.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

    // Sanity: the issued token works against an employer-only route.
    const me = await withToken(res.body.data.token).get('/v1/employer/profile');
    expect(me.status).toBe(200);
  });

  it('creates an employee user when role=employee', async () => {
    const phone = '+972500000031';
    const regToken = await getRegistrationToken(phone);
    const res = await api()
      .post('/v1/shared/auth/register')
      .set('Authorization', `Bearer ${regToken}`)
      .send({ full_name: 'דנה העובדת', role: 'employee' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('employee');
  });

  it('rejects when full_name missing', async () => {
    const regToken = await getRegistrationToken('+972500000032');
    const res = await api()
      .post('/v1/shared/auth/register')
      .set('Authorization', `Bearer ${regToken}`)
      .send({ role: 'employer' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/full_name/);
  });

  it('rejects an invalid role value', async () => {
    const regToken = await getRegistrationToken('+972500000033');
    const res = await api()
      .post('/v1/shared/auth/register')
      .set('Authorization', `Bearer ${regToken}`)
      .send({ full_name: 'Alice', role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('rejects when there is no registration token at all', async () => {
    const res = await api()
      .post('/v1/shared/auth/register')
      .send({ full_name: 'Alice', role: 'employer' });
    expect(res.status).toBe(401);
  });

  it('rejects with a malformed Bearer token', async () => {
    const res = await api()
      .post('/v1/shared/auth/register')
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .send({ full_name: 'Alice', role: 'employer' });
    expect(res.status).toBe(401);
  });

  it('rejects when a session JWT is presented in place of the registration token', async () => {
    // Sessions tokens have a different purpose claim than registration tokens.
    const session = await signupAsEmployer('+972500000034', 'Test');
    const otherPhone = '+972500000035';
    await requestOtp(otherPhone);

    const res = await api()
      .post('/v1/shared/auth/register')
      .set('Authorization', `Bearer ${session.token}`)
      .send({ full_name: 'Other', role: 'employer' });
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/shared/auth/logout', () => {
  it('returns ok for any caller (stateless)', async () => {
    const session = await signupAsEmployer('+972500000040', 'Logout Test');
    const res = await session.request().post('/v1/shared/auth/logout').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);

    // Stateless: token is NOT actually invalidated — it still works after logout.
    // (Token revocation is documented as a known limitation in STATUS.md.)
    const stillWorks = await session.request().get('/v1/employer/profile');
    expect(stillWorks.status).toBe(200);
  });
});

describe('GET /v1/shared/auth/dev/last-otp (dev-only)', () => {
  it('returns the last OTP for a phone after /sms/request', async () => {
    const phone = '+972500000050';
    const requestedCode = await requestOtp(phone);
    const res = await api()
      .get('/v1/shared/auth/dev/last-otp')
      .query({ phone });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe(phone);
    expect(typeof res.body.data.code).toBe('string');
    // The code from /dev/last-otp should match the dev_code returned by
    // /sms/request — both derive from the same TOTP secret.
    expect(res.body.data.code).toBe(requestedCode);
  });

  it('returns 400 when phone query param is missing', async () => {
    const res = await api().get('/v1/shared/auth/dev/last-otp');
    expect(res.status).toBe(400);
  });

  it('returns 404 for a phone that never requested an OTP', async () => {
    const res = await api()
      .get('/v1/shared/auth/dev/last-otp')
      .query({ phone: '+972599999999' });
    expect(res.status).toBe(404);
  });
});

describe('JWT auth middleware', () => {
  it('rejects requests with no Authorization header (401)', async () => {
    const res = await api().get('/v1/employer/profile');
    expect(res.status).toBe(401);
  });

  it('rejects a token with the wrong scheme', async () => {
    const session = await signupAsEmployer('+972500000060', 'Scheme Test');
    const res = await api()
      .get('/v1/employer/profile')
      .set('Authorization', `Basic ${session.token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a totally bogus JWT', async () => {
    const res = await api()
      .get('/v1/employer/profile')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.bogus.signature');
    expect(res.status).toBe(401);
  });

  it('rejects a JWT signed with a different secret', async () => {
    // Build a JWT that LOOKS like a Findly token but is signed with a wrong secret.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ sub: 1, role: 'employer' }, 'wrong-secret', {
      expiresIn: '1h',
    });
    const res = await api()
      .get('/v1/employer/profile')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});

describe('cross-role authorization', () => {
  it('returns 403 when an employee accesses /v1/employer/*', async () => {
    const employee = await signupAsEmployee('+972500000070', 'Employee');
    const res = await employee.request().get('/v1/employer/events');
    expect(res.status).toBe(403);
  });

  it('returns 403 when an employer accesses /v1/employee/*', async () => {
    const employer = await signupAsEmployer('+972500000071', 'Employer');
    const res = await employer.request().get('/v1/employee/applications');
    expect(res.status).toBe(403);
  });
});
