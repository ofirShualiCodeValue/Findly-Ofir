// E2E coverage of /v1/employer/profile/* (the employer-side profile surface).
//
// Endpoints under test:
//   GET    /v1/employer/profile
//   PATCH  /v1/employer/profile
//   PUT    /v1/employer/profile/activity-areas
//   PUT    /v1/employer/profile/event-categories
//   PUT    /v1/employer/profile/industries
//   PUT    /v1/employer/profile/industry-subcategories
//   POST   /v1/employer/profile/complete
//   POST   /v1/employer/profile/logo  (multipart)

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployer, Session } from './helpers/api';

interface TaxonomyRow { id: number; slug: string }

let employer: Session;
let areaId: number;
let categoryId: number;
let industryId: number;
let subCatId: number;

beforeEach(async () => {
  await resetUserData();
  employer = await signupAsEmployer('+972500002001', 'Profile Test');
  const [areas, cats, inds] = await Promise.all([
    employer.request().get('/v1/shared/areas'),
    employer.request().get('/v1/shared/categories'),
    employer.request().get('/v1/shared/industries'),
  ]);
  areaId = (areas.body.data as TaxonomyRow[])[0].id;
  categoryId = (cats.body.data as TaxonomyRow[])[0].id;
  const firstInd = inds.body.data[0];
  industryId = firstInd.id;
  subCatId = firstInd.sub_categories[0]?.id;
});

afterAll(async () => {
  await closeDb();
});

describe('GET /v1/employer/profile', () => {
  it('returns the freshly-signed-up employer with empty business profile', async () => {
    const res = await employer.request().get('/v1/employer/profile');
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('Profile Test');
    expect(res.body.data.phone).toBe('+972500002001');
    expect(res.body.data.business).toBeDefined();
    expect(res.body.data.business.is_complete).toBe(false);
    expect(Array.isArray(res.body.data.activity_areas)).toBe(true);
    expect(Array.isArray(res.body.data.event_categories)).toBe(true);
    expect(Array.isArray(res.body.data.industries)).toBe(true);
  });

  // FINDING: GET /v1/employer/profile entity (EmployerProfileFullEntity)
  //   does NOT expose `role`. Whether that's intentional or an oversight
  //   depends on whether the Flutter client needs it; clients normally
  //   already know the role from the JWT used to log in.
  it('does NOT expose role at top level (current behavior — possibly intentional)', async () => {
    const res = await employer.request().get('/v1/employer/profile');
    expect(res.body.data.role).toBeUndefined();
  });
});

describe('PATCH /v1/employer/profile', () => {
  it('updates account fields (full_name, email)', async () => {
    const res = await employer.request()
      .patch('/v1/employer/profile')
      .send({ full_name: 'Updated Name', email: 'updated@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('Updated Name');
    expect(res.body.data.email).toBe('updated@example.com');
  });

  it('updates business profile fields', async () => {
    const res = await employer.request()
      .patch('/v1/employer/profile')
      .send({
        business_name: 'My Business Ltd',
        owner_name: 'Owner Person',
        vat_number: '123456789',
        contact_email: 'contact@biz.com',
        address: 'Rothschild 1, Tel Aviv',
        latitude: 32.0853,
        longitude: 34.7818,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.business.business_name).toBe('My Business Ltd');
    expect(res.body.data.business.owner_name).toBe('Owner Person');
    expect(res.body.data.business.vat_number).toBe('123456789');
    expect(res.body.data.business.address).toBe('Rothschild 1, Tel Aviv');
  });

  it('accepts an empty body (no-op)', async () => {
    const res = await employer.request().patch('/v1/employer/profile').send({});
    expect(res.status).toBe(200);
  });

  // FINDING: Neither the handler nor EmployerProfile.applyUpdates validates
  //   latitude/longitude ranges. Out-of-range values (e.g. lat=200, lng=-300)
  //   are silently persisted. The DB column is a string so it accepts any
  //   numeric input. Recommend adding bounds checks in the handler.
  it('CURRENTLY accepts out-of-range latitude (no validation — finding)', async () => {
    const res = await employer.request()
      .patch('/v1/employer/profile')
      .send({ latitude: 200 });
    expect(res.status).toBe(200);
  });

  it('CURRENTLY accepts out-of-range longitude (no validation — finding)', async () => {
    const res = await employer.request()
      .patch('/v1/employer/profile')
      .send({ longitude: -300 });
    expect(res.status).toBe(200);
  });
});

describe('PUT /v1/employer/profile/activity-areas', () => {
  it('replaces the employer\'s areas', async () => {
    const res = await employer.request()
      .put('/v1/employer/profile/activity-areas')
      .send({ area_ids: [areaId] });
    expect(res.status).toBe(200);
    expect(res.body.data.activity_areas.length).toBe(1);
    expect(res.body.data.activity_areas[0].id).toBe(areaId);
  });

  it('clears all areas when given an empty array', async () => {
    await employer.request()
      .put('/v1/employer/profile/activity-areas')
      .send({ area_ids: [areaId] });
    const res = await employer.request()
      .put('/v1/employer/profile/activity-areas')
      .send({ area_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.activity_areas.length).toBe(0);
  });

  it('rejects when area_ids is not an array', async () => {
    const res = await employer.request()
      .put('/v1/employer/profile/activity-areas')
      .send({ area_ids: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('rejects when array contains non-integers', async () => {
    const res = await employer.request()
      .put('/v1/employer/profile/activity-areas')
      .send({ area_ids: ['x', 'y'] });
    expect(res.status).toBe(400);
  });
});

describe('PUT /v1/employer/profile/event-categories', () => {
  it('replaces the employer\'s categories', async () => {
    const res = await employer.request()
      .put('/v1/employer/profile/event-categories')
      .send({ category_ids: [categoryId] });
    expect(res.status).toBe(200);
    expect(res.body.data.event_categories.length).toBe(1);
  });

  it('rejects non-array input', async () => {
    const res = await employer.request()
      .put('/v1/employer/profile/event-categories')
      .send({ category_ids: null });
    expect(res.status).toBe(400);
  });
});

describe('PUT /v1/employer/profile/industries', () => {
  it('replaces the employer\'s industries', async () => {
    const res = await employer.request()
      .put('/v1/employer/profile/industries')
      .send({ industry_ids: [industryId] });
    expect(res.status).toBe(200);
    expect(res.body.data.industries.length).toBe(1);
    expect(res.body.data.industries[0].id).toBe(industryId);
  });
});

describe('PUT /v1/employer/profile/industry-subcategories', () => {
  it('replaces the employer\'s industry sub-categories', async () => {
    if (!subCatId) {
      // Some industries have no subs in seed data — skip this test then.
      return;
    }
    const res = await employer.request()
      .put('/v1/employer/profile/industry-subcategories')
      .send({ industry_subcategory_ids: [subCatId] });
    expect(res.status).toBe(200);
    expect(res.body.data.industry_sub_categories.length).toBe(1);
  });
});

describe('POST /v1/employer/profile/complete', () => {
  const validBody = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    full_name: 'Complete Owner',
    business_name: 'Complete Biz',
    owner_name: 'Owner',
    vat_number: '999888777',
    contact_email: 'c@example.com',
    address: 'Dizengoff 1, Tel Aviv',
    activity_area_ids: [areaId],
    event_category_ids: [categoryId],
    industry_ids: [industryId],
    ...overrides,
  });

  it('flips is_complete=true on the business profile', async () => {
    const res = await employer.request()
      .post('/v1/employer/profile/complete')
      .send(validBody());
    expect(res.status).toBe(200);
    expect(res.body.data.business.is_complete).toBe(true);
    expect(res.body.data.business.business_name).toBe('Complete Biz');
    expect(res.body.data.activity_areas.length).toBe(1);
    expect(res.body.data.event_categories.length).toBe(1);
    expect(res.body.data.industries.length).toBe(1);
  });

  it('rejects when business_name missing', async () => {
    const res = await employer.request()
      .post('/v1/employer/profile/complete')
      .send(validBody({ business_name: '' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/business_name/);
  });

  it('rejects when address missing', async () => {
    const res = await employer.request()
      .post('/v1/employer/profile/complete')
      .send(validBody({ address: '' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/address/);
  });

  it('rejects when activity_area_ids is empty', async () => {
    const res = await employer.request()
      .post('/v1/employer/profile/complete')
      .send(validBody({ activity_area_ids: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects when event_category_ids is empty', async () => {
    const res = await employer.request()
      .post('/v1/employer/profile/complete')
      .send(validBody({ event_category_ids: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects when industry_ids is empty', async () => {
    const res = await employer.request()
      .post('/v1/employer/profile/complete')
      .send(validBody({ industry_ids: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects when an activity_area_id does not exist', async () => {
    const res = await employer.request()
      .post('/v1/employer/profile/complete')
      .send(validBody({ activity_area_ids: [999_999] }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/activity_area_ids/);
  });
});

describe('POST /v1/employer/profile/logo', () => {
  it('rejects when no file is uploaded', async () => {
    const res = await employer.request()
      .post('/v1/employer/profile/logo')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/file/i);
  });

  it('accepts a valid PNG and returns logo_url', async () => {
    // Tiny 1×1 PNG file — valid header so multer's mime check passes.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    /* eslint-disable @typescript-eslint/no-require-imports */
    const request = require('supertest');
    const res = await request(require('../app').default)
      .post('/v1/employer/profile/logo')
      .set('Authorization', `Bearer ${employer.token}`)
      .attach('file', png, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.business.logo_url).toMatch(/uploads/);
  });
});
