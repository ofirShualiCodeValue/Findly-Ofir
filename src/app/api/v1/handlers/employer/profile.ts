import { Router, Request, Response } from 'express';
import { Transaction } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { sequelize } from '../../../../../db/connection';
import { User } from '../../../../models/User';
import {
  EmployerProfile,
  EmployerProfileUpdateInput,
} from '../../../../models/EmployerProfile';
import { EmployerProfileFullEntity } from '../../entities/employer/profile/full';
import { logoUpload, publicLogoUrl } from '../../../helpers/uploads/multer';
import { assertCoord } from '../../../helpers/validation';

const router = Router();

// =====================================================================
// Input-validation helpers — pure shape/format checks. State-dependent
// rules (FK existence, geocoding) live on the User / EmployerProfile
// models.
// =====================================================================

/** Translate the snake_case body into the typed profile input. */
function parseProfileBody(body: Record<string, unknown>): {
  account: Parameters<User['applyAccountUpdates']>[0];
  profile: EmployerProfileUpdateInput;
} {
  const account: Parameters<User['applyAccountUpdates']>[0] = {};
  if (body.full_name !== undefined) account.fullName = body.full_name as string;
  if (body.email !== undefined) account.email = body.email as string | null;
  if (body.notifications && typeof body.notifications === 'object') {
    account.notifications = body.notifications as {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    };
  }

  const profile: EmployerProfileUpdateInput = {};
  // String fields — passed through untouched. Coords are handled separately
  // below so they go through bounds validation.
  const stringFieldMap: Record<string, keyof EmployerProfileUpdateInput> = {
    business_name: 'businessName',
    owner_name: 'ownerName',
    vat_number: 'vatNumber',
    contact_email: 'contactEmail',
    contact_phone: 'contactPhone',
    address: 'address',
    logo_url: 'logoUrl',
  };
  for (const [snake, camel] of Object.entries(stringFieldMap)) {
    if (body[snake] !== undefined) {
      (profile as Record<string, unknown>)[camel] = body[snake];
    }
  }
  if (body.latitude !== undefined) {
    profile.latitude = String(assertCoord(body.latitude, 'latitude', 90));
  }
  if (body.longitude !== undefined) {
    profile.longitude = String(assertCoord(body.longitude, 'longitude', 180));
  }
  return { account, profile };
}

function parseIdArrayOr400(raw: unknown, field: string): number[] {
  if (!Array.isArray(raw) || raw.some((x) => !Number.isInteger(x))) {
    throw new APIError(400, `${field} must be an array of integers`);
  }
  return raw as number[];
}

async function loadFullProfile(req: Request): Promise<User> {
  const user = await User.findByPk(req.currentUser!.id, {
    include: EmployerProfileFullEntity.includes(req),
  });
  if (!user) throw new APIError(404, 'User not found');
  return user;
}

// =====================================================================
// Routes — thin handlers: parse → call model → render.
// =====================================================================

/**
 * @openapi
 * /v1/employer/profile:
 *   get:
 *     tags: [Employer Profile]
 *     summary: Get current employer's full profile
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Full profile with business info, service areas, and event categories
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/profile:
 *   patch:
 *     tags: [Employer Profile]
 *     summary: Update profile fields (User and EmployerProfile combined)
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const { account, profile: profileUpdates } = parseProfileBody(req.body ?? {});

    await sequelize.transaction(async (transaction: Transaction) => {
      await currentUser.applyAccountUpdates(account, { transaction });
      if (Object.keys(profileUpdates).length) {
        const profile = await EmployerProfile.findForUserOrThrow(currentUser.id, {
          transaction,
        });
        await profile.applyUpdates(profileUpdates, { transaction });
      }
    });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/profile/activity-areas:
 *   put:
 *     tags: [Employer Profile]
 *     summary: Replace the employer's service areas (m:n sync)
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  '/activity-areas',
  asyncHandler(async (req: Request, res: Response) => {
    const ids = parseIdArrayOr400(req.body?.area_ids, 'area_ids');
    await req.currentUser!.setActivityAreas(ids);
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/profile/event-categories:
 *   put:
 *     tags: [Employer Profile]
 *     summary: Replace the employer's event categories (m:n sync)
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  '/event-categories',
  asyncHandler(async (req: Request, res: Response) => {
    const ids = parseIdArrayOr400(req.body?.category_ids, 'category_ids');
    await req.currentUser!.setEventCategories(ids);
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/profile/industries:
 *   put:
 *     tags: [Employer Profile]
 *     summary: Replace the employer's industries
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  '/industries',
  asyncHandler(async (req: Request, res: Response) => {
    const ids = parseIdArrayOr400(req.body?.industry_ids, 'industry_ids');
    await req.currentUser!.setIndustries(ids);
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/profile/industry-subcategories:
 *   put:
 *     tags: [Employer Profile]
 *     summary: Replace the employer's industry sub-categories (specialties)
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  '/industry-subcategories',
  asyncHandler(async (req: Request, res: Response) => {
    const ids = parseIdArrayOr400(
      req.body?.industry_subcategory_ids,
      'industry_subcategory_ids',
    );
    await req.currentUser!.setIndustrySubCategories(ids);
    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/profile/complete:
 *   post:
 *     tags: [Employer Profile]
 *     summary: Single-shot post-signup completion form
 *     description: |
 *       Mandatory fields the employer must fill before the system regards
 *       their account as complete (`business.is_complete` flag flips to
 *       true after this succeeds). Mirrors `/v1/employee/profile/complete`.
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [business_name, address, activity_area_ids, event_category_ids, industry_ids]
 *             properties:
 *               full_name: { type: string }
 *               business_name: { type: string }
 *               owner_name: { type: string }
 *               vat_number: { type: string }
 *               contact_email: { type: string, nullable: true }
 *               address: { type: string }
 *               activity_area_ids:
 *                 type: array
 *                 items: { type: integer }
 *               event_category_ids:
 *                 type: array
 *                 items: { type: integer }
 *               industry_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200: { description: Updated profile }
 */
router.post(
  '/complete',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const businessName = String(body.business_name ?? '').trim();
    const address = String(body.address ?? '').trim();
    if (!businessName) throw new APIError(400, 'business_name is required');
    if (!address) throw new APIError(400, 'address is required');

    const activityAreaIds = parseIdArrayOr400(body.activity_area_ids, 'activity_area_ids');
    const eventCategoryIds = parseIdArrayOr400(body.event_category_ids, 'event_category_ids');
    const industryIds = parseIdArrayOr400(body.industry_ids, 'industry_ids');
    if (!activityAreaIds.length) {
      throw new APIError(400, 'activity_area_ids must include at least one area');
    }
    if (!eventCategoryIds.length) {
      throw new APIError(400, 'event_category_ids must include at least one category');
    }
    if (!industryIds.length) {
      throw new APIError(400, 'industry_ids must include at least one industry');
    }

    await req.currentUser!.completeEmployerRegistration({
      fullName: typeof body.full_name === 'string' ? body.full_name.trim() : undefined,
      businessName,
      ownerName: typeof body.owner_name === 'string' ? body.owner_name.trim() : null,
      vatNumber: typeof body.vat_number === 'string' ? body.vat_number.trim() : null,
      contactEmail: typeof body.contact_email === 'string' ? body.contact_email.trim() : null,
      address,
      activityAreaIds,
      eventCategoryIds,
      industryIds,
    });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/profile/logo:
 *   post:
 *     tags: [Employer Profile]
 *     summary: Upload a new business logo (multipart/form-data, field name 'file')
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  '/logo',
  logoUpload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new APIError(400, 'No file uploaded (field name must be "file", JPEG/PNG/WebP up to 2MB)');
    }
    const profile = await EmployerProfile.findForUserOrThrow(req.currentUser!.id);
    await profile.setLogoUrl(publicLogoUrl(req.file.filename));

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

export default router;
