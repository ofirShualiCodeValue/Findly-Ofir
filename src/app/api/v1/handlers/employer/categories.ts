import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { EventCategory } from '../../../../models/EventCategory';
import { TaxonomyEntity } from '../../entities/shared/taxonomies/base';

const router = Router();

/**
 * @openapi
 * /v1/employer/categories:
 *   get:
 *     tags: [Employer Taxonomies]
 *     summary: List active event categories
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Array of categories
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Taxonomy' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const rows = await EventCategory.findAll({
      where: { active: true },
      order: [
        ['displayOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    await renderSuccess(res, rows, TaxonomyEntity);
  }),
);

export default router;
