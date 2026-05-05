// E2E coverage of /v1/employee/profile/*.
//
// Endpoints under test:
//   GET    /v1/employee/profile
//   PATCH  /v1/employee/profile
//   POST   /v1/employee/profile/complete
//   PUT    /v1/employee/profile/industries
//   PUT    /v1/employee/profile/industry-subcategories
//   PUT    /v1/employee/profile/certifications
//   POST   /v1/employee/profile/avatar
//   GET    /v1/employee/profile/rating
//   GET    /v1/employee/profile/earnings
//
// We test /complete only with explicit lat/lng (NOT home_city) to avoid
// hitting Nominatim from the test suite — the geocoding path is a separate
// integration concern.

import { resetUserData, closeDb } from './helpers/db';
import { signupAsEmployee, Session } from './helpers/api';

let employee: Session;
let industryId: number;
let subCatId: number | undefined;

beforeEach(async () => {
  await resetUserData();
  employee = await signupAsEmployee('+972500008001', 'Profile Worker');
  const inds = await employee.request().get('/v1/shared/industries');
  industryId = inds.body.data[0].id;
  subCatId = inds.body.data[0].sub_categories[0]?.id;
});

afterAll(async () => {
  await closeDb();
});

describe('GET /v1/employee/profile', () => {
  it('returns the employee\'s profile (incomplete by default)', async () => {
    const res = await employee.request().get('/v1/employee/profile');
    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe('Profile Worker');
    expect(res.body.data.profile).toBeDefined();
    expect(res.body.data.profile.is_complete).toBe(false);
  });
});

describe('PATCH /v1/employee/profile', () => {
  it('updates account + profile fields atomically', async () => {
    const res = await employee.request()
      .patch('/v1/employee/profile')
      .send({
        first_name: 'דנה',
        last_name: 'כהן',
        email: 'dana@example.com',
        work_status: 'freelancer',
        base_hourly_rate: 80,
        location_range_km: 25,
        home_city: 'תל אביב',
        home_latitude: 32.0853,
        home_longitude: 34.7818,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('dana@example.com');
    expect(res.body.data.profile.work_status).toBe('freelancer');
  });

  it('rejects under-18 date_of_birth', async () => {
    const res = await employee.request()
      .patch('/v1/employee/profile')
      .send({ date_of_birth: '2015-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/age/i);
  });

  it('rejects invalid work_status', async () => {
    const res = await employee.request()
      .patch('/v1/employee/profile')
      .send({ work_status: 'unicorn' });
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range latitude', async () => {
    const res = await employee.request()
      .patch('/v1/employee/profile')
      .send({ home_latitude: 200 });
    expect(res.status).toBe(400);
  });

  it('rejects negative base_hourly_rate', async () => {
    const res = await employee.request()
      .patch('/v1/employee/profile')
      .send({ base_hourly_rate: -10 });
    expect(res.status).toBe(400);
  });

  it('rejects location_range_km < 1', async () => {
    const res = await employee.request()
      .patch('/v1/employee/profile')
      .send({ location_range_km: 0 });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/employee/profile/complete', () => {
  function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      first_name: 'Worker',
      last_name: 'McEmployee',
      date_of_birth: '1995-04-12',
      work_status: 'freelancer',
      location_range_km: 30,
      base_hourly_rate: 80,
      home_latitude: 32.0853,
      home_longitude: 34.7818,
      industry_ids: [industryId],
      industry_subcategory_ids: subCatId ? [subCatId] : [],
      ...overrides,
    };
  }

  it('flips is_complete=true', async () => {
    const res = await employee.request()
      .post('/v1/employee/profile/complete')
      .send(validBody());
    expect(res.status).toBe(200);
    expect(res.body.data.profile.is_complete).toBe(true);
  });

  it('rejects under-18 date_of_birth', async () => {
    const res = await employee.request()
      .post('/v1/employee/profile/complete')
      .send(validBody({ date_of_birth: '2018-01-01' }));
    expect(res.status).toBe(400);
  });

  it('rejects when neither date_of_birth nor year_of_birth provided', async () => {
    const body = validBody();
    delete body.date_of_birth;
    const res = await employee.request().post('/v1/employee/profile/complete').send(body);
    expect(res.status).toBe(400);
  });

  it('rejects when neither home_city nor coords provided', async () => {
    const body = validBody();
    delete body.home_latitude;
    delete body.home_longitude;
    const res = await employee.request().post('/v1/employee/profile/complete').send(body);
    expect(res.status).toBe(400);
  });

  it('rejects missing work_status', async () => {
    const body = validBody();
    delete body.work_status;
    const res = await employee.request().post('/v1/employee/profile/complete').send(body);
    expect(res.status).toBe(400);
  });
});

describe('PUT /v1/employee/profile/industries', () => {
  it('replaces the employee\'s industries', async () => {
    const res = await employee.request()
      .put('/v1/employee/profile/industries')
      .send({ industry_ids: [industryId] });
    expect(res.status).toBe(200);
    expect(res.body.data.industries.length).toBe(1);
  });

  it('rejects non-array input', async () => {
    const res = await employee.request()
      .put('/v1/employee/profile/industries')
      .send({ industry_ids: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /v1/employee/profile/industry-subcategories', () => {
  it('replaces the employee\'s sub-categories', async () => {
    if (!subCatId) return;
    const res = await employee.request()
      .put('/v1/employee/profile/industry-subcategories')
      .send({ industry_subcategory_ids: [subCatId] });
    expect(res.status).toBe(200);
    expect(res.body.data.industry_sub_categories.length).toBe(1);
  });
});

describe('PUT /v1/employee/profile/certifications', () => {
  it('accepts an empty array (clears certs)', async () => {
    const res = await employee.request()
      .put('/v1/employee/profile/certifications')
      .send({ certification_ids: [] });
    expect(res.status).toBe(200);
  });

  it('rejects non-array', async () => {
    const res = await employee.request()
      .put('/v1/employee/profile/certifications')
      .send({ certification_ids: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/employee/profile/avatar', () => {
  it('rejects when no file is uploaded', async () => {
    const res = await employee.request()
      .post('/v1/employee/profile/avatar')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/employee/profile/rating', () => {
  it('returns the employee\'s rating summary (empty for fresh user)', async () => {
    const res = await employee.request().get('/v1/employee/profile/rating');
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
    expect(res.body.data.avg).toBeNull();
    expect(Array.isArray(res.body.data.history)).toBe(true);
  });
});

describe('GET /v1/employee/profile/earnings', () => {
  it('returns the employee\'s earnings summary (empty for fresh user)', async () => {
    const res = await employee.request().get('/v1/employee/profile/earnings');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});
