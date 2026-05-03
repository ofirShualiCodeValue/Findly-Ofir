import { Router, Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { sequelize } from '../../../../../db/connection';
import { User } from '../../../../models/User';
import { EmployeeProfile, WorkStatus } from '../../../../models/EmployeeProfile';
import { EventCategory } from '../../../../models/EventCategory';
import { EmployerEventCategory } from '../../../../models/EmployerEventCategory';
import { EmployeeProfileFullEntity } from '../../entities/employee/profile/full';
import { avatarUpload, publicAvatarUrl } from '../../../helpers/uploads/multer';

const router = Router();

const MIN_AGE = 18;

async function loadFullProfile(req: Request): Promise<User> {
  const user = await User.findByPk(req.currentUser!.id, {
    include: EmployeeProfileFullEntity.includes(req),
  });
  if (!user) throw new APIError(404, 'User not found');
  return user;
}

async function getOrThrowProfile(userId: number, transaction?: Transaction): Promise<EmployeeProfile> {
  const profile = await EmployeeProfile.findOne({ where: { userId }, transaction });
  if (!profile) throw new APIError(404, 'Employee profile not found');
  return profile;
}

function ageInYears(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new APIError(400, 'Invalid date_of_birth (expected YYYY-MM-DD)');
  }
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function assertAdult(dateOfBirth: string): void {
  const age = ageInYears(dateOfBirth);
  if (age < MIN_AGE) {
    throw new APIError(400, 'Age requirement not met', {
      code: 'AGE_REQUIREMENT_NOT_MET',
      minimum_age: MIN_AGE,
      actual_age: age,
    });
  }
}

function assertWorkStatus(value: unknown): WorkStatus {
  if (typeof value !== 'string' || !Object.values(WorkStatus).includes(value as WorkStatus)) {
    throw new APIError(400, `work_status must be one of: ${Object.values(WorkStatus).join(', ')}`);
  }
  return value as WorkStatus;
}

function assertCoord(value: unknown, field: string, range: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < -range || n > range) {
    throw new APIError(400, `${field} must be a number between -${range} and ${range}`);
  }
  return n;
}

function assertNonNegativeNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new APIError(400, `${field} must be a non-negative number`);
  }
  return n;
}

function assertPositiveInt(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new APIError(400, `${field} must be a positive integer`);
  }
  return n;
}

/**
 * @openapi
 * /v1/employee/profile:
 *   get:
 *     tags: [Employee Profile]
 *     summary: Get current employee's full profile (Personal Details)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Full profile with industries and activity areas }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/profile:
 *   patch:
 *     tags: [Employee Profile]
 *     summary: Update profile fields (User and EmployeeProfile combined)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               email: { type: string, nullable: true }
 *               id_number: { type: string, nullable: true }
 *               bank_account_number: { type: string, nullable: true }
 *               bank_branch: { type: string, nullable: true }
 *               bank_name: { type: string, nullable: true }
 *               date_of_birth: { type: string, format: date }
 *               work_status: { type: string, enum: [freelancer, self_employed] }
 *               location_range_km: { type: integer }
 *               base_hourly_rate: { type: number }
 *               home_latitude: { type: number }
 *               home_longitude: { type: number }
 *               notifications:
 *                 type: object
 *                 properties:
 *                   email: { type: boolean }
 *                   sms: { type: boolean }
 *                   push: { type: boolean }
 *     responses:
 *       200: { description: Updated profile }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.patch(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const body = req.body ?? {};

    if (body.date_of_birth !== undefined && body.date_of_birth !== null) {
      assertAdult(String(body.date_of_birth));
    }
    if (body.work_status !== undefined && body.work_status !== null) {
      assertWorkStatus(body.work_status);
    }
    if (body.home_latitude !== undefined) assertCoord(body.home_latitude, 'home_latitude', 90);
    if (body.home_longitude !== undefined) assertCoord(body.home_longitude, 'home_longitude', 180);
    if (body.base_hourly_rate !== undefined) assertNonNegativeNumber(body.base_hourly_rate, 'base_hourly_rate');
    if (body.location_range_km !== undefined) assertPositiveInt(body.location_range_km, 'location_range_km');

    await sequelize.transaction(async (transaction: Transaction) => {
      const userUpdates: Partial<User> = {};
      if (body.full_name !== undefined) userUpdates.fullName = body.full_name;
      if (body.email !== undefined) userUpdates.email = body.email;
      if (body.notifications && typeof body.notifications === 'object') {
        if (typeof body.notifications.email === 'boolean') userUpdates.notifyEmail = body.notifications.email;
        if (typeof body.notifications.sms === 'boolean') userUpdates.notifySms = body.notifications.sms;
        if (typeof body.notifications.push === 'boolean') userUpdates.notifyPush = body.notifications.push;
      }
      if (Object.keys(userUpdates).length) {
        await User.update(userUpdates, { where: { id: currentUser.id }, transaction });
      }

      const profileUpdates: Partial<EmployeeProfile> = {};
      const profileFieldMap: Record<string, keyof EmployeeProfile> = {
        id_number: 'idNumber',
        bank_account_number: 'bankAccountNumber',
        bank_branch: 'bankBranch',
        bank_name: 'bankName',
        date_of_birth: 'dateOfBirth',
        work_status: 'workStatus',
        location_range_km: 'locationRangeKm',
        base_hourly_rate: 'baseHourlyRate',
        home_latitude: 'homeLatitude',
        home_longitude: 'homeLongitude',
      };
      for (const [snake, camel] of Object.entries(profileFieldMap)) {
        if (body[snake] !== undefined) {
          (profileUpdates as Record<string, unknown>)[camel] =
            body[snake] === null ? null : String(body[snake]);
        }
      }
      // Numbers stored as integers
      if (body.location_range_km !== undefined && body.location_range_km !== null) {
        (profileUpdates as Record<string, unknown>).locationRangeKm = Number(body.location_range_km);
      }

      if (Object.keys(profileUpdates).length) {
        const profile = await getOrThrowProfile(currentUser.id, transaction);
        await profile.update(profileUpdates, { transaction });
      }
    });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/profile/complete:
 *   post:
 *     tags: [Employee Profile]
 *     summary: Complete first-time registration (age check + mandatory fields)
 *     description: |
 *       Validates the user is 18+ and sets all mandatory employee fields in one
 *       call. Returns the updated profile. Idempotent — can be called multiple
 *       times to update.
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date_of_birth, work_status, location_range_km, base_hourly_rate, home_latitude, home_longitude]
 *             properties:
 *               date_of_birth: { type: string, format: date }
 *               work_status: { type: string, enum: [freelancer, self_employed] }
 *               location_range_km: { type: integer, minimum: 1 }
 *               base_hourly_rate: { type: number, minimum: 0 }
 *               home_latitude: { type: number }
 *               home_longitude: { type: number }
 *               industry_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200: { description: Updated profile }
 *       400:
 *         description: Validation error (incl. AGE_REQUIREMENT_NOT_MET)
 */
router.post(
  '/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const body = req.body ?? {};

    const required = [
      'date_of_birth',
      'work_status',
      'location_range_km',
      'base_hourly_rate',
      'home_latitude',
      'home_longitude',
    ];
    const missing = required.filter((k) => body[k] === undefined || body[k] === null || body[k] === '');
    if (missing.length) {
      throw new APIError(400, `Missing required fields: ${missing.join(', ')}`);
    }

    assertAdult(String(body.date_of_birth));
    const workStatus = assertWorkStatus(body.work_status);
    const homeLat = assertCoord(body.home_latitude, 'home_latitude', 90);
    const homeLng = assertCoord(body.home_longitude, 'home_longitude', 180);
    const baseRate = assertNonNegativeNumber(body.base_hourly_rate, 'base_hourly_rate');
    const rangeKm = assertPositiveInt(body.location_range_km, 'location_range_km');

    const industryIds: number[] = Array.isArray(body.industry_ids) ? body.industry_ids : [];
    if (industryIds.some((x) => !Number.isInteger(x))) {
      throw new APIError(400, 'industry_ids must be an array of integers');
    }
    if (industryIds.length) {
      const found = await EventCategory.count({ where: { id: industryIds } });
      if (found !== industryIds.length) {
        throw new APIError(400, 'One or more industry_ids are invalid');
      }
    }

    await sequelize.transaction(async (transaction: Transaction) => {
      const profile = await getOrThrowProfile(currentUser.id, transaction);
      await profile.update(
        {
          dateOfBirth: String(body.date_of_birth),
          workStatus,
          locationRangeKm: rangeKm,
          baseHourlyRate: String(baseRate),
          homeLatitude: String(homeLat),
          homeLongitude: String(homeLng),
        },
        { transaction },
      );

      // Replace industries (m:n via employer_event_categories — reused per agreement)
      await EmployerEventCategory.destroy({ where: { userId: currentUser.id } as never, transaction });
      if (industryIds.length) {
        await EmployerEventCategory.bulkCreate(
          industryIds.map((id) => ({ userId: currentUser.id, eventCategoryId: id })) as never,
          { transaction },
        );
      }
    });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/profile/industries:
 *   post:
 *     tags: [Employee Profile]
 *     summary: Add a single industry (event category) to the employee
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [industry_id]
 *             properties:
 *               industry_id: { type: integer }
 *     responses:
 *       200: { description: Updated profile }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: Industry already linked }
 */
router.post(
  '/industries',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const id = Number(req.body?.industry_id);
    if (!Number.isInteger(id) || id < 1) throw new APIError(400, 'industry_id must be a positive integer');

    const cat = await EventCategory.findByPk(id);
    if (!cat) throw new APIError(400, 'Invalid industry_id');

    const existing = await EmployerEventCategory.findOne({
      where: { userId: currentUser.id, eventCategoryId: id } as never,
    });
    if (existing) throw new APIError(409, 'Industry already linked');

    await EmployerEventCategory.create({
      userId: currentUser.id,
      eventCategoryId: id,
    } as never);

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/profile/industries/{id}:
 *   delete:
 *     tags: [Employee Profile]
 *     summary: Remove a single industry from the employee
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Updated profile }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete(
  '/industries/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new APIError(400, 'Invalid industry id');

    const removed = await EmployerEventCategory.destroy({
      where: { userId: currentUser.id, eventCategoryId: id } as never,
    });
    if (!removed) throw new APIError(404, 'Industry not linked to this user');

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/profile/avatar:
 *   post:
 *     tags: [Employee Profile]
 *     summary: Upload profile picture (multipart/form-data, field 'file')
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Updated profile with new avatar_url }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.post(
  '/avatar',
  avatarUpload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new APIError(400, 'No file uploaded (field name must be "file", JPEG/PNG/WebP up to 2MB)');
    }
    const profile = await getOrThrowProfile(req.currentUser!.id);
    await profile.update({ avatarUrl: publicAvatarUrl(req.file.filename) });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

export default router;
