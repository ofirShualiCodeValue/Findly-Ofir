// E2E coverage of the shared taxonomy endpoints (read-only, auth-gated).
//
// Endpoints under test:
//   GET /v1/shared/areas
//   GET /v1/shared/categories
//   GET /v1/shared/industries
//   GET /v1/shared/certifications
//   GET /v1/employer/areas
//   GET /v1/employer/categories
//
// The taxonomy is seeded once in globalSetup from src/db/seeds/, so we just
// validate shape, ordering, and access control here.

import { resetUserData, closeDb } from './helpers/db';
import { api, signupAsEmployer, signupAsEmployee, Session } from './helpers/api';

let employer: Session;
let employee: Session;

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500001001', 'Tax Employer');
  employee = await signupAsEmployee('+972500001002', 'Tax Employee');
});

afterAll(async () => {
  await closeDb();
});

describe('GET /v1/shared/areas', () => {
  it('returns the seeded activity areas', async () => {
    const res = await employer.request().get('/v1/shared/areas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(typeof first.id).toBe('number');
    expect(typeof first.name).toBe('string');
    expect(typeof first.slug).toBe('string');
  });

  it('is sorted by display_order', async () => {
    const res = await employer.request().get('/v1/shared/areas');
    const orders = res.body.data.map(
      (a: { display_order?: number }) => a.display_order,
    );
    const sorted = [...orders].sort((x, y) => Number(x) - Number(y));
    expect(orders).toEqual(sorted);
  });

  it('is accessible to employees too (shared route)', async () => {
    const res = await employee.request().get('/v1/shared/areas');
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await api().get('/v1/shared/areas');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/shared/categories', () => {
  it('returns the seeded event categories', async () => {
    const res = await employer.request().get('/v1/shared/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    // Wedding category is part of the canonical seed.
    const wedding = res.body.data.find(
      (c: { slug: string }) => c.slug === 'wedding',
    );
    expect(wedding).toBeDefined();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await api().get('/v1/shared/categories');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/shared/industries', () => {
  it('returns industries with nested sub_categories', async () => {
    const res = await employer.request().get('/v1/shared/industries');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(typeof first.id).toBe('number');
    expect(Array.isArray(first.sub_categories)).toBe(true);

    if (first.sub_categories.length > 0) {
      const sub = first.sub_categories[0];
      expect(sub.industry_id).toBe(first.id);
      expect(typeof sub.slug).toBe('string');
    }
  });

  it('exposes the same data to employees', async () => {
    const empRes = await employer.request().get('/v1/shared/industries');
    const eeRes = await employee.request().get('/v1/shared/industries');
    expect(empRes.body.data.length).toBe(eeRes.body.data.length);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await api().get('/v1/shared/industries');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/shared/certifications', () => {
  it('returns certifications (may be empty if none seeded)', async () => {
    const res = await employer.request().get('/v1/shared/certifications');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await api().get('/v1/shared/certifications');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/employer/{areas,categories} (employer mirrors of shared)', () => {
  it('returns the same areas as /v1/shared/areas', async () => {
    const sharedRes = await employer.request().get('/v1/shared/areas');
    const employerRes = await employer.request().get('/v1/employer/areas');
    expect(employerRes.status).toBe(200);
    expect(employerRes.body.data.length).toBe(sharedRes.body.data.length);
  });

  it('returns the same categories as /v1/shared/categories', async () => {
    const sharedRes = await employer.request().get('/v1/shared/categories');
    const employerRes = await employer.request().get('/v1/employer/categories');
    expect(employerRes.status).toBe(200);
    expect(employerRes.body.data.length).toBe(sharedRes.body.data.length);
  });

  it('rejects employees on /v1/employer/areas (role mismatch)', async () => {
    const res = await employee.request().get('/v1/employer/areas');
    expect(res.status).toBe(403);
  });
});
