import { Router, Request, Response } from 'express';
import { Model, ModelStatic, Transaction } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { sequelize } from '../../../../../db/connection';
import { User } from '../../../../models/User';
import { EmployerProfile } from '../../../../models/EmployerProfile';
import { ActivityArea } from '../../../../models/ActivityArea';
import { EventCategory } from '../../../../models/EventCategory';
import { EmployerActivityArea } from '../../../../models/EmployerActivityArea';
import { EmployerEventCategory } from '../../../../models/EmployerEventCategory';
import { EmployerProfileFullEntity } from '../../entities/employer/profile/full';
import { logoUpload, publicLogoUrl } from '../../../helpers/uploads/multer';

const router = Router();

async function loadFullProfile(req: Request): Promise<User> {
  const user = await User.findByPk(req.currentUser!.id, {
    include: EmployerProfileFullEntity.includes(req),
  });
  if (!user) {
    throw new APIError(404, 'User not found');
  }
  return user;
}

/**
 * @openapi
 * /v1/employer/profile:
 *   get:
 *     tags: [Employer Profile]
 *     summary: Get current employer's full profile
 *     security: [{ DevAuth: [] }]
 *     responses:
 *       200:
 *         description: Full profile with business info, service areas, and event categories
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/EmployerProfile' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
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
 *     security: [{ DevAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateProfileInput' }
 *     responses:
 *       200:
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/EmployerProfile' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.patch(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const body = req.body ?? {};

    await sequelize.transaction(async (transaction: Transaction) => {
      const userUpdates: Partial<User> = {};
      if (body.full_name !== undefined) userUpdates.fullName = body.full_name;
      if (body.email !== undefined) userUpdates.email = body.email;
      if (body.notifications && typeof body.notifications === 'object') {
        if (typeof body.notifications.email === 'boolean') {
          userUpdates.notifyEmail = body.notifications.email;
        }
        if (typeof body.notifications.sms === 'boolean') {
          userUpdates.notifySms = body.notifications.sms;
        }
        if (typeof body.notifications.push === 'boolean') {
          userUpdates.notifyPush = body.notifications.push;
        }
      }
      if (Object.keys(userUpdates).length) {
        await User.update(userUpdates, {
          where: { id: currentUser.id },
          transaction,
        });
      }

      const profileFields = [
        'business_name',
        'owner_name',
        'vat_number',
        'contact_email',
        'contact_phone',
        'address',
        'logo_url',
      ] as const;
      const camelMap: Record<string, keyof EmployerProfile> = {
        business_name: 'businessName',
        owner_name: 'ownerName',
        vat_number: 'vatNumber',
        contact_email: 'contactEmail',
        contact_phone: 'contactPhone',
        address: 'address',
        logo_url: 'logoUrl',
      };

      const profileUpdates: Partial<EmployerProfile> = {};
      for (const f of profileFields) {
        if (body[f] !== undefined) {
          (profileUpdates as Record<string, unknown>)[camelMap[f]] = body[f];
        }
      }

      if (Object.keys(profileUpdates).length) {
        const profile = await EmployerProfile.findOne({
          where: { userId: currentUser.id },
          transaction,
        });
        if (!profile) {
          throw new APIError(404, 'Employer profile not found');
        }
        await profile.update(profileUpdates, { transaction });
      }
    });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

async function syncJunction<T extends Model>(
  Junction: ModelStatic<T>,
  userId: number,
  ids: number[],
  fk: 'activityAreaId' | 'eventCategoryId',
): Promise<void> {
  await sequelize.transaction(async (transaction: Transaction) => {
    await Junction.destroy({ where: { user_id: userId } as never, transaction });
    if (ids.length) {
      const rows = ids.map((id) => ({ userId, [fk]: id }));
      await Junction.bulkCreate(rows as never, { transaction });
    }
  });
}

/**
 * @openapi
 * /v1/employer/profile/activity-areas:
 *   put:
 *     tags: [Employer Profile]
 *     summary: Replace the employer's service areas (m:n sync)
 *     security: [{ DevAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [area_ids]
 *             properties:
 *               area_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/EmployerProfile' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.put(
  '/activity-areas',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const ids: unknown = req.body?.area_ids;
    if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) {
      throw new APIError(400, 'area_ids must be an array of integers');
    }

    if (ids.length) {
      const found = await ActivityArea.count({ where: { id: ids as number[] } });
      if (found !== (ids as number[]).length) {
        throw new APIError(400, 'One or more area_ids are invalid');
      }
    }

    await syncJunction(EmployerActivityArea, currentUser.id, ids as number[], 'activityAreaId');

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
 *     security: [{ DevAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category_ids]
 *             properties:
 *               category_ids:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Updated profile
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.put(
  '/event-categories',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const ids: unknown = req.body?.category_ids;
    if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) {
      throw new APIError(400, 'category_ids must be an array of integers');
    }

    if (ids.length) {
      const found = await EventCategory.count({ where: { id: ids as number[] } });
      if (found !== (ids as number[]).length) {
        throw new APIError(400, 'One or more category_ids are invalid');
      }
    }

    await syncJunction(
      EmployerEventCategory,
      currentUser.id,
      ids as number[],
      'eventCategoryId',
    );

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
 *     description: |
 *       Accepts JPEG/PNG/WebP up to 2 MB. Stores in local filesystem (MVP).
 *       Production should use S3 presigned uploads.
 *     security: [{ DevAuth: [] }]
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
 *       200:
 *         description: Updated profile with new logo_url
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/EmployerProfile' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/logo',
  logoUpload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new APIError(400, 'No file uploaded (field name must be "file", JPEG/PNG/WebP up to 2MB)');
    }

    const profile = await EmployerProfile.findOne({
      where: { userId: req.currentUser!.id },
    });
    if (!profile) {
      throw new APIError(404, 'Employer profile not found');
    }

    await profile.update({ logoUrl: publicLogoUrl(req.file.filename) });

    const user = await loadFullProfile(req);
    await renderSuccess(res, user, EmployerProfileFullEntity);
  }),
);

export default router;
