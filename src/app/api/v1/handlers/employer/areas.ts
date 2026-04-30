import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { ActivityArea } from '../../../../models/ActivityArea';
import { TaxonomyEntity } from '../../entities/shared/taxonomies/base';

const router = Router();

/**
 * @openapi
 * /v1/employer/areas:
 *   get:
 *     tags: [Employer Taxonomies]
 *     summary: List active activity (service) areas
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Array of areas
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
    const rows = await ActivityArea.findAll({
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
