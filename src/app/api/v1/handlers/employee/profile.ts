import { Router, Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { sequelize } from '../../../../../db/connection';
import { User } from '../../../../models/User';
import {
  EmployeeProfile,
  WorkStatus,
  EmployeeProfileUpdateInput,
} from '../../../../models/EmployeeProfile';
import { WorkerRating } from '../../../../models/WorkerRating';
import { EventApplication } from '../../../../models/EventApplication';
import { EmployeeProfileFullEntity } from '../../entities/employee/profile/full';
import { avatarUpload, publicAvatarUrl } from '../../../helpers/uploads/multer';
import { geocodeIsraeliCity } from '../../../helpers/geocoding';

const router = Router();

const MIN_AGE = 18;

// =====================================================================
// Input-validation helpers — pure shape/format checks. State-dependent
// rules (FK existence, transaction orchestration) live on the models.
// =====================================================================

async function loadFullProfile(req: Request): Promise<User> {
  const user = await User.findByPk(req.currentUser!.id, {
    include: EmployeeProfileFullEntity.includes(req),
  });
  if (!user) throw new APIError(404, 'User not found');
  return user;
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

function parseIdArrayOr400(raw: unknown, field: string): number[] {
  if (!Array.isArray(raw) || raw.some((x) => !Number.isInteger(x))) {
    throw new APIError(400, `${field} must be an array of integers`);
  }
  return raw as number[];
}

/** Translate the snake_case PATCH body into typed account+profile inputs. */
function parsePatchBody(body: Record<string, unknown>): {
  account: Parameters<User['applyAccountUpdates']>[0];
  profile: EmployeeProfileUpdateInput;
} {
  // Input-shape validations — done eagerly so we 400 before opening a tx.
  if (body.date_of_birth !== undefined && body.date_of_birth !== null) {
    assertAdult(ageFromDateString(String(body.date_of_birth)));
  }
  if (body.work_status !== undefined && body.work_status !== null) {
    assertWorkStatus(body.work_status);
  }
  if (body.home_latitude !== undefined) assertCoord(body.home_latitude, 'home_latitude', 90);
  if (body.home_longitude !== undefined) assertCoord(body.home_longitude, 'home_longitude', 180);
  if (body.base_hourly_rate !== undefined) {
    assertNonNegativeNumber(body.base_hourly_rate, 'base_hourly_rate');
  }
  if (body.location_range_km !== undefined) {
    assertPositiveInt(body.location_range_km, 'location_range_km');
  }

  const account: Parameters<User['applyAccountUpdates']>[0] = {};
  if (body.full_name !== undefined) account.fullName = body.full_name as string;
  if (body.first_name !== undefined) account.firstName = body.first_name as string;
  if (body.last_name !== undefined) account.lastName = body.last_name as string;
  // If first/last passed but full_name wasn't, compose full_name.
  if (
    (body.first_name !== undefined || body.last_name !== undefined) &&
    body.full_name === undefined
  ) {
    const composed = `${body.first_name ?? ''} ${body.last_name ?? ''}`.trim();
    if (composed) account.fullName = composed;
  }
  if (body.email !== undefined) account.email = body.email as string | null;
  if (body.notifications && typeof body.notifications === 'object') {
    account.notifications = body.notifications as {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    };
  }

  const profile: EmployeeProfileUpdateInput = {};
  const stringFieldMap: Record<string, keyof EmployeeProfileUpdateInput> = {
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
      (profile as Record<string, unknown>)[camel] =
        body[snake] === null ? null : String(body[snake]);
    }
  }
  if (body.location_range_km !== undefined && body.location_range_km !== null) {
    profile.locationRangeKm = Number(body.location_range_km);
  }
  return { account, profile };
}

// =====================================================================
// Routes — thin handlers: parse → call model → render.
// =====================================================================

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

router.patch(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const { account, profile: profileUpdates } = parsePatchBody(req.body ?? {});

    await sequelize.transaction(async (transaction: Transaction) => {
      await currentUser.applyAccountUpdates(account, { transaction });
      if (Object.keys(profileUpdates).length) {
        const profile = await EmployeeProfile.findForUserOrThrow(currentUser.id, {
          transaction,
        });
        await profile.applyUpdates(profileUpdates, { transaction });
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

router.post(
  '/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const body: CompleteRegistrationBody = req.body ?? {};

    // ----- Input parsing + age check + coord resolution -----
    let dobString: string;
    let age: number;
    if (body.date_of_birth) {
      age = ageFromDateString(String(body.date_of_birth));
      dobString = String(body.date_of_birth);
    } else if (body.year_of_birth !== undefined) {
      age = ageFromYearOfBirth(Number(body.year_of_birth));
      dobString = `${Number(body.year_of_birth)}-01-01`;
    } else {
      throw new APIError(400, 'date_of_birth or year_of_birth is required');
    }
    assertAdult(age);

    const workStatus = assertWorkStatus(body.work_status);
    const baseRate = assertNonNegativeNumber(body.base_hourly_rate, 'base_hourly_rate');
    const rangeKm = assertPositiveInt(body.location_range_km, 'location_range_km');

    let homeLat: number;
    let homeLng: number;
    if (body.home_latitude !== undefined && body.home_longitude !== undefined) {
      homeLat = assertCoord(body.home_latitude, 'home_latitude', 90);
      homeLng = assertCoord(body.home_longitude, 'home_longitude', 180);
    } else if (body.home_city) {
      const geo = await geocodeIsraeliCity(String(body.home_city));
      if (!geo) {
        throw new APIError(
          400,
          'Could not resolve home_city to coordinates. Provide home_latitude/home_longitude.',
        );
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
      throw new APIError(
        400,
        'industry_ids and industry_subcategory_ids must be arrays of integers',
      );
    }

    await currentUser.completeEmployeeRegistration({
      firstName: body.first_name,
      lastName: body.last_name,
      dateOfBirth: dobString,
      workStatus,
      locationRangeKm: rangeKm,
      baseHourlyRate: baseRate,
      homeCity: body.home_city ?? null,
      homeLatitude: homeLat,
      homeLongitude: homeLng,
      industryIds,
      industrySubCategoryIds: subCategoryIds,
    });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

router.put(
  '/industries',
  asyncHandler(async (req: Request, res: Response) => {
    const ids = parseIdArrayOr400(req.body?.industry_ids, 'industry_ids');
    await req.currentUser!.setIndustries(ids);
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

router.put(
  '/industry-subcategories',
  asyncHandler(async (req: Request, res: Response) => {
    const ids = parseIdArrayOr400(
      req.body?.industry_subcategory_ids,
      'industry_subcategory_ids',
    );
    await req.currentUser!.setIndustrySubCategories(ids);
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

router.put(
  '/certifications',
  asyncHandler(async (req: Request, res: Response) => {
    const ids = parseIdArrayOr400(req.body?.certification_ids, 'certification_ids');
    await req.currentUser!.setCertifications(ids);
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

router.post(
  '/avatar',
  avatarUpload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new APIError(
        400,
        'No file uploaded (field name must be "file", JPEG/PNG/WebP up to 2MB)',
      );
    }
    const profile = await EmployeeProfile.findForUserOrThrow(req.currentUser!.id);
    await profile.setAvatarUrl(publicAvatarUrl(req.file.filename));
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployeeProfileFullEntity);
  }),
);

router.get(
  '/rating',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.currentUser!.id;
    const summary = await WorkerRating.summaryFor(userId);
    const history = await WorkerRating.historyFor(userId);

    res.json({
      code: 200,
      message: 'ok',
      data: {
        avg: summary.avg,
        count: summary.count,
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

router.get(
  '/earnings',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await EventApplication.earningsFor(req.currentUser!.id);
    res.json({ code: 200, message: 'ok', data });
  }),
);

export default router;
