// DB helpers shared by every e2e test file.
//
// Strategy:
//   - The taxonomy tables (event_categories, activity_areas, industries,
//     industry_subcategories, certifications) are seeded ONCE in globalSetup
//     and treated as read-only by tests.
//   - All other tables hold per-test user data and are TRUNCATE-d in
//     `resetUserData()` between tests so each `it` starts from a clean slate.
//
// We TRUNCATE the entire set in one statement with CASCADE + RESTART IDENTITY
// so FK ordering doesn't matter and IDs stay deterministic across runs.

import { sequelize } from '../../db/connection';

const USER_DATA_TABLES: ReadonlyArray<string> = [
  // Auth / sessions
  'tokens',
  'credentials',
  // Profile-bound m:n joins
  'user_certifications',
  'user_industry_subcategories',
  'user_industries',
  'employer_event_categories',
  'employer_activity_areas',
  // Domain rows that depend on users/events
  'worker_ratings',
  'event_applications',
  'event_interests',
  'shift_staffing_requirements',
  'shifts',
  'notifications',
  'push_devices',
  'events',
  // Profiles + users
  'employer_profiles',
  'employee_profiles',
  'users',
];

/** TRUNCATE every per-test row, leaving the seeded taxonomy intact. */
export async function resetUserData(): Promise<void> {
  const tables = USER_DATA_TABLES.map((t) => `"${t}"`).join(', ');
  await sequelize.query(
    `TRUNCATE ${tables} RESTART IDENTITY CASCADE`,
  );
}

/** Close the shared sequelize pool (call from afterAll of every test file). */
export async function closeDb(): Promise<void> {
  await sequelize.close();
}
