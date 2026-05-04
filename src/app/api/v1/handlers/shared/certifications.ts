import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { Certification } from '../../../../models/Certification';
import { TaxonomyEntity } from '../../entities/shared/taxonomies/base';

const router = Router();

/**
 * @openapi
 * /v1/shared/certifications:
 *   get:
 *     tags: [Shared Taxonomies]
 *     summary: List active certifications (תעודות)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Array of certifications
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await Certification.findAll({
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
