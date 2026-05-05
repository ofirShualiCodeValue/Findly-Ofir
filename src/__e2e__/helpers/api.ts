// HTTP test helpers. Wraps supertest with the shared express app and provides
// shortcut signup/login flows so individual tests don't have to re-implement
// the 3-step OTP+register dance.

import request from 'supertest';
import type { Application } from 'express';

// Lazy-load the app so `process.env` is fully pinned by jest.setup.ts before
// `config.ts` runs its strict validation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
let cachedApp: Application | undefined;
export function getApp(): Application {
  if (!cachedApp) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedApp = require('../../app').default as Application;
  }
  return cachedApp;
}

export type Role = 'employer' | 'employee';

export interface SessionUser {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  role: Role;
}

export interface Session {
  token: string;
  user: SessionUser;
  /** supertest agent factory pre-bound with the Authorization header. */
  request: () => AuthedRequest;
}

export interface AuthedRequest {
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  put: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  delete: (url: string) => request.Test;
}

function authed(token: string): AuthedRequest {
  const agent = request(getApp());
  const bearer = `Bearer ${token}`;
  return {
    get: (url) => agent.get(url).set('Authorization', bearer),
    post: (url) => agent.post(url).set('Authorization', bearer),
    put: (url) => agent.put(url).set('Authorization', bearer),
    patch: (url) => agent.patch(url).set('Authorization', bearer),
    delete: (url) => agent.delete(url).set('Authorization', bearer),
  };
}

/** Plain (unauthenticated) supertest agent against the shared app. */
export function api(): request.SuperTest<request.Test> {
  return request(getApp());
}

/** Step 1+2 of OTP — returns the dev_code so callers can pipe it to /verify. */
export async function requestOtp(phone: string): Promise<string> {
  const res = await api().post('/v1/shared/auth/sms/request').send({ phone });
  if (res.status !== 200) {
    throw new Error(`sms/request failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const code = res.body?.data?.dev_code;
  if (!code) {
    throw new Error(
      `sms/request did not return dev_code. Is NODE_ENV=development? body=${JSON.stringify(res.body)}`,
    );
  }
  return String(code);
}

/**
 * Full signup flow:
 *   1. POST /sms/request           → dev_code
 *   2. POST /sms/verify {code}     → {is_new_user: true, registration_token}
 *   3. POST /register {full_name, role} → {token, user}
 */
export async function signup(opts: {
  phone: string;
  fullName: string;
  role: Role;
}): Promise<Session> {
  const code = await requestOtp(opts.phone);

  const verify = await api()
    .post('/v1/shared/auth/sms/verify')
    .send({ phone: opts.phone, code });
  if (verify.status !== 200) {
    throw new Error(`sms/verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  }
  if (verify.body?.data?.is_new_user !== true) {
    throw new Error(
      `Expected new user for ${opts.phone}; got: ${JSON.stringify(verify.body?.data)}`,
    );
  }
  const registrationToken = verify.body.data.registration_token as string;

  const reg = await api()
    .post('/v1/shared/auth/register')
    .set('Authorization', `Bearer ${registrationToken}`)
    .send({ full_name: opts.fullName, role: opts.role });
  if (reg.status !== 200) {
    throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  }

  const token = reg.body.data.token as string;
  const user = reg.body.data.user as SessionUser;
  return { token, user, request: () => authed(token) };
}

export const signupAsEmployer = (phone: string, fullName: string): Promise<Session> =>
  signup({ phone, fullName, role: 'employer' });

export const signupAsEmployee = (phone: string, fullName: string): Promise<Session> =>
  signup({ phone, fullName, role: 'employee' });

/**
 * Re-login for an existing user: OTP request + verify, returns the new JWT.
 * Used when a test needs to validate that the second login (existing user
 * branch of /sms/verify) works correctly.
 */
export async function loginExisting(phone: string): Promise<Session> {
  const code = await requestOtp(phone);
  const verify = await api()
    .post('/v1/shared/auth/sms/verify')
    .send({ phone, code });
  if (verify.status !== 200) {
    throw new Error(`sms/verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  }
  if (verify.body?.data?.is_new_user !== false) {
    throw new Error(
      `Expected existing user for ${phone}; got: ${JSON.stringify(verify.body?.data)}`,
    );
  }
  const token = verify.body.data.token as string;
  const user = verify.body.data.user as SessionUser;
  return { token, user, request: () => authed(token) };
}

/** Wrap a known-good token into an AuthedRequest (e.g. for forged JWT tests). */
export function withToken(token: string): AuthedRequest {
  return authed(token);
}
