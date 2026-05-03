import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { Industry } from '../../../../models/Industry';
import { IndustrySubCategory } from '../../../../models/IndustrySubCategory';

const router = Router();

/**
 * @openapi
 * /v1/shared/industries:
 *   get:
 *     tags: [Shared Taxonomies]
 *     summary: List active industries with their sub-categories nested
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Array of industries, each with `sub_categories[]`
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await Industry.findAll({
      where: { active: true },
      order: [
        ['displayOrder', 'ASC'],
        ['name', 'ASC'],
      ],
      include: [
        {
          model: IndustrySubCategory,
          where: { active: true },
          required: false,
          separate: true,
          order: [
            ['displayOrder', 'ASC'],
            ['name', 'ASC'],
          ],
        },
      ],
    });

    res.json({
      code: 200,
      message: 'ok',
      data: rows.map((i) => ({
        id: i.id,
        name: i.name,
        slug: i.slug,
        sub_categories: (i.subCategories || []).map((s) => ({
          id: s.id,
          industry_id: s.industryId,
          name: s.name,
          slug: s.slug,
        })),
      })),
    });
  }),
);

export default router;
