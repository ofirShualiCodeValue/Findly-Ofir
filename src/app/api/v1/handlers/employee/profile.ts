import { Router, Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { sequelize } from '../../../../../db/connection';
import { User } from '../../../../models/User';
import { EmployeeProfile, WorkStatus } from '../../../../models/EmployeeProfile';
import { Industry } from '../../../../models/Industry';
import { IndustrySubCategory } from '../../../../models/IndustrySubCategory';
import { UserIndustry } from '../../../../models/UserIndustry';
import { UserIndustrySubCategory } from '../../../../models/UserIndustrySubCategory';
import { Certification } from '../../../../models/Certification';
import { UserCertification } from '../../../../models/UserCertification';
import { WorkerRating } from '../../../../models/WorkerRating';
import { EventApplication, EventApplicationStatus } from '../../../../models/EventApplication';
import { Event } from '../../../../models/Event';
import { EmployeeProfileFullEntity } from '../../entities/employee/profile/full';
import { avatarUpload, publicAvatarUrl } from '../../../helpers/uploads/multer';
import { geocodeIsraeliCity } from '../../../helpers/geocoding';

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

function ageFromYearOfBirth(yearOfBirth: number): number {
  if (!Number.isInteger(yearOfBirth) || yearOfBirth < 1900 || yearOfBirth > new Date().getFullYear()) {
    throw new APIError(400, 'Invalid year_of_birth');
  }
  return new Date().getFullYear() - yearOfBirth;
}

function ageFromDateString(dateOfBirth: string): number {
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

function assertAdult(age: number): void {
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
 *       200: { description: Full profile with industries and sub-categories }
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
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               full_name: { type: string }
 *               email: { type: string, nullable: true }
 *               id_number: { type: string, nullable: true }
 *               bank_account_number: { type: string, nullable: true }
 *               bank_branch: { type: string, nullable: true }
 *               bank_name: { type: string, nullable: true }
 *               date_of_birth: { type: string, format: date }
 *               work_status: { type: string, enum: [freelancer, salaried] }
 *               location_range_km: { type: integer }
 *               base_hourly_rate: { type: number }
 *               home_city: { type: string }
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
 */
router.patch(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const body = req.body ?? {};

    if (body.date_of_birth !== undefined && body.date_of_birth !== null) {
      assertAdult(ageFromDateString(String(body.date_of_birth)));
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
      if (body.first_name !== undefined) userUpdates.firstName = body.first_name;
      if (body.last_name !== undefined) userUpdates.lastName = body.last_name;
      // If first/last passed but full_name wasn't, recompute full_name.
      if (
        (body.first_name !== undefined || body.last_name !== undefined) &&
        body.full_name === undefined
      ) {
        const fn = body.first_name ?? '';
        const ln = body.last_name ?? '';
        const composed = `${fn} ${ln}`.trim();
        if (composed) userUpdates.fullName = composed;
      }
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
      const stringFieldMap: Record<string, keyof EmployeeProfile> = {
        id_number: 'idNumber',
        bank_account_number: 'bankAccountNumber',
        bank_branch: 'bankBranch',
        bank_name: 'bankName',
        date_of_birth: 'dateOfBirth',
        work_status: 'workStatus',
        base_hourly_rate: 'baseHourlyRate',
        home_latitude: 'homeLatitude',
        home_longitude: 'homeLongitude',
        home_city: 'homeCity',
      };
      for (const [snake, camel] of Object.entries(stringFieldMap)) {
        if (body[snake] !== undefined) {
          (profileUpdates as Record<string, unknown>)[camel] =
            body[snake] === null ? null : String(body[snake]);
        }
      }
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

interface CompleteRegistrationBody {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  year_of_birth?: number;
  work_status?: string;
  location_range_km?: number;
  base_hourly_rate?: number;
  home_city?: string;
  home_latitude?: number;
  home_longitude?: number;
  industry_ids?: number[];
  industry_subcategory_ids?: number[];
}

/**
 * @openapi
 * /v1/employee/profile/complete:
 *   post:
 *     tags: [Employee Profile]
 *     summary: Complete first-time registration (age check + mandatory fields)
 *     description: |
 *       Single-shot registration. Accepts either `date_of_birth` (YYYY-MM-DD)
 *       or `year_of_birth`. If `home_city` is supplied without coords, the
 *       server geocodes it via Nominatim. Returns 400 with code
 *       `AGE_REQUIREMENT_NOT_MET` if the user is under 18.
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               year_of_birth: { type: integer }
 *               date_of_birth: { type: string, format: date }
 *               work_status: { type: string, enum: [freelancer, salaried] }
 *               location_range_km: { type: integer, minimum: 1 }
 *               base_hourly_rate: { type: number, minimum: 0 }
 *               home_city: { type: string }
 *               home_latitude: { type: number }
 *               home_longitude: { type: number }
 *               industry_ids:
 *                 type: array
 *                 items: { type: integer }
 *               industry_subcategory_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200: { description: Updated profile }
 */
router.post(
  '/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const body: CompleteRegistrationBody = req.body ?? {};

    // Age check via either a year (Figma form) or a full date.
    let dobString: string | null = null;
    let age: number;
    if (body.date_of_birth) {
      age = ageFromDateString(String(body.date_of_birth));
      dobString = String(body.date_of_birth);
    } else if (body.year_of_birth !== undefined) {
      age = ageFromYearOfBirth(Number(body.year_of_birth));
      // Store as Jan 1 of that year — granularity matches the wheel-picker UI.
      dobString = `${Number(body.year_of_birth)}-01-01`;
    } else {
      throw new APIError(400, 'date_of_birth or year_of_birth is required');
    }
    assertAdult(age);

    const workStatus = assertWorkStatus(body.work_status);
    const baseRate = assertNonNegativeNumber(body.base_hourly_rate, 'base_hourly_rate');
    const rangeKm = assertPositiveInt(body.location_range_km, 'location_range_km');

    // Home location: prefer client-supplied coords. Fall back to geocoding
    // the city when only the city is given. If both fail we error — the
    // matcher needs coords.
    let homeLat: number | null = null;
    let homeLng: number | null = null;
    if (body.home_latitude !== undefined && body.home_longitude !== undefined) {
      homeLat = assertCoord(body.home_latitude, 'home_latitude', 90);
      homeLng = assertCoord(body.home_longitude, 'home_longitude', 180);
    } else if (body.home_city) {
      const geo = await geocodeIsraeliCity(String(body.home_city));
      if (!geo) {
        throw new APIError(400, 'Could not resolve home_city to coordinates. Provide home_latitude/home_longitude.');
      }
      homeLat = geo.latitude;
      homeLng = geo.longitude;
    } else {
      throw new APIError(400, 'home_city or home_latitude/home_longitude is required');
    }

    const industryIds: number[] = Array.isArray(body.industry_ids) ? body.industry_ids : [];
    const subCategoryIds: number[] = Array.isArray(body.industry_subcategory_ids)
      ? body.industry_subcategory_ids
      : [];
    if ([...industryIds, ...subCategoryIds].some((x) => !Number.isInteger(x))) {
      throw new APIError(400, 'industry_ids and industry_subcategory_ids must be arrays of integers');
    }
    if (industryIds.length) {
      const found = await Industry.count({ where: { id: industryIds } });
      if (found !== industryIds.length) throw new APIError(400, 'One or more industry_ids are invalid');
    }
    if (subCategoryIds.length) {
      const found = await IndustrySubCategory.count({ where: { id: subCategoryIds } });
      if (found !== subCategoryIds.length) {
        throw new APIError(400, 'One or more industry_subcategory_ids are invalid');
      }
    }

    await sequelize.transaction(async (transaction: Transaction) => {
      const userUpdates: Partial<User> = {};
      if (body.first_name !== undefined) userUpdates.firstName = body.first_name;
      if (body.last_name !== undefined) userUpdates.lastName = body.last_name;
      if (body.first_name || body.last_name) {
        const composed = `${body.first_name ?? ''} ${body.last_name ?? ''}`.trim();
        if (composed) userUpdates.fullName = composed;
      }
      if (Object.keys(userUpdates).length) {
        await User.update(userUpdates, { where: { id: currentUser.id }, transaction });
      }

      const profile = await getOrThrowProfile(currentUser.id, transaction);
      await profile.update(
        {
          dateOfBirth: dobString,
          workStatus,
          locationRangeKm: rangeKm,
          baseHourlyRate: String(baseRate),
          homeLatitude: String(homeLat),
          homeLongitude: String(homeLng),
          homeCity: body.home_city ? String(body.home_city) : null,
        },
        { transaction },
      );

      // Replace industries + sub-categories.
      await UserIndustry.destroy({ where: { userId: currentUser.id }, transaction });
      if (industryIds.length) {
        await UserIndustry.bulkCreate(
          industryIds.map((id) => ({ userId: currentUser.id, industryId: id })) as never,
          { transaction },
        );
      }
      await UserIndustrySubCategory.destroy({ where: { userId: currentUser.id }, transaction });
      if (subCategoryIds.length) {
        await UserIndustrySubCategory.bulkCreate(
          subCategoryIds.map((id) => ({
            userId: currentUser.id,
            industrySubCategoryId: id,
          })) as never,
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
 *   put:
 *     tags: [Employee Profile]
 *     summary: Replace the employee's industries
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [industry_ids]
 *             properties:
 *               industry_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200: { description: Updated profile }
 */
router.put(
  '/industries',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const ids: unknown = req.body?.industry_ids;
    if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) {
      throw new APIError(400, 'industry_ids must be an array of integers');
    }
    if (ids.length) {
      const found = await Industry.count({ where: { id: ids as number[] } });
      if (found !== (ids as number[]).length) {
        throw new APIError(400, 'One or more industry_ids are invalid');
      }
    }

    await sequelize.transaction(async (transaction: Transaction) => {
      await UserIndustry.destroy({ where: { userId: currentUser.id }, transaction });
      if ((ids as number[]).length) {
        await UserIndustry.bulkCreate(
          (ids as number[]).map((id) => ({ userId: currentUser.id, industryId: id })) as never,
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
 * /v1/employee/profile/industry-subcategories:
 *   put:
 *     tags: [Employee Profile]
 *     summary: Replace the employee's industry sub-categories (specialties)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [industry_subcategory_ids]
 *             properties:
 *               industry_subcategory_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200: { description: Updated profile }
 */
router.put(
  '/industry-subcategories',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const ids: unknown = req.body?.industry_subcategory_ids;
    if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) {
      throw new APIError(400, 'industry_subcategory_ids must be an array of integers');
    }
    if (ids.length) {
      const found = await IndustrySubCategory.count({ where: { id: ids as number[] } });
      if (found !== (ids as number[]).length) {
        throw new APIError(400, 'One or more industry_subcategory_ids are invalid');
      }
    }

    await sequelize.transaction(async (transaction: Transaction) => {
      await UserIndustrySubCategory.destroy({ where: { userId: currentUser.id }, transaction });
      if ((ids as number[]).length) {
        await UserIndustrySubCategory.bulkCreate(
          (ids as number[]).map((id) => ({
            userId: currentUser.id,
            industrySubCategoryId: id,
          })) as never,
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
 * /v1/employee/profile/avatar:
 *   post:
 *     tags: [Employee Profile]
 *     summary: Upload profile picture (multipart/form-data, field 'file')
 *     security: [{ BearerAuth: [] }]
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

/**
 * @openapi
 * /v1/employee/profile/rating:
 *   get:
 *     tags: [Employee Profile]
 *     summary: Current employee's own rating summary + recent feedback
 *     description: |
 *       Counterpart of `GET /v1/employer/events/:eventId/applications/:id`'s
 *       rating block — but scoped to the worker themselves. Powers the stars
 *       beneath the avatar on the employee profile screen and the rating
 *       history card.
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: avg + count + history }
 */
router.get(
  '/rating',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.currentUser!.id;

    const all = await WorkerRating.findAll({
      where: { workerUserId: userId },
      attributes: ['rating'],
    });
    const avg = all.length
      ? Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 100) / 100
      : null;

    const history = await WorkerRating.findAll({
      where: { workerUserId: userId },
      include: [
        {
          model: EventApplication,
          attributes: ['id', 'eventId'],
          include: [{ model: Event, attributes: ['id', 'name'] }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: 20,
    });

    res.json({
      code: 200,
      message: 'ok',
      data: {
        avg,
        count: all.length,
        history: history.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          created_at: r.createdAt,
          event: r.application?.event
            ? { id: r.application.event.id, name: r.application.event.name }
            : null,
        })),
      },
    });
  }),
);

/**
 * @openapi
 * /v1/employee/profile/earnings:
 *   get:
 *     tags: [Employee Profile]
 *     summary: Monthly earnings rollup for the current employee
 *     description: |
 *       Sums `proposed_amount` over approved applications, bucketed by the
 *       event's `start_at` month. Powers the "הכנסות חודשיות" card.
 *       Returns the current month, the previous month, and an all-time total.
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Earnings rollup }
 */
router.get(
  '/earnings',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.currentUser!.id;

    // Boundaries: start of last month → start of next month (exclusive).
    const now = new Date();
    const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
    const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const apps = await EventApplication.findAll({
      where: {
        userId,
        status: EventApplicationStatus.APPROVED,
      },
      include: [
        { model: Event, attributes: ['id', 'startAt'], required: true },
      ],
    });

    let current = 0;
    let previous = 0;
    let total = 0;
    for (const a of apps) {
      const amount = Number(a.proposedAmount ?? 0);
      if (!Number.isFinite(amount)) continue;
      total += amount;
      const startAt = a.event?.startAt ? new Date(a.event.startAt) : null;
      if (!startAt) continue;
      if (startAt >= startCurrent && startAt < startNext) current += amount;
      else if (startAt >= startPrevious && startAt < startCurrent) previous += amount;
    }

    res.json({
      code: 200,
      message: 'ok',
      data: {
        current_month: Math.round(current * 100) / 100,
        previous_month: Math.round(previous * 100) / 100,
        total: Math.round(total * 100) / 100,
        approved_application_count: apps.length,
      },
    });
  }),
);

/**
 * @openapi
 * /v1/employee/profile/certifications:
 *   put:
 *     tags: [Employee Profile]
 *     summary: Replace the employee's certifications (m:n sync)
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  '/certifications',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.currentUser!.id;
    const ids: unknown = req.body?.certification_ids;
    if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) {
      throw new APIError(400, 'certification_ids must be an array of integers');
    }
    if ((ids as number[]).length) {
      const found = await Certification.count({ where: { id: ids as number[] } });
      if (found !== (ids as number[]).length) {
        throw new APIError(400, 'One or more certification_ids are invalid');
      }
    }

    await sequelize.transaction(async (transaction: Transaction) => {
      await UserCertification.destroy({ where: { userId }, transaction });
      if ((ids as number[]).length) {
        await UserCertification.bulkCreate(
          (ids as number[]).map((id) => ({ userId, certificationId: id })) as never,
          { transaction },
        );
      }
    });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

export default router;
