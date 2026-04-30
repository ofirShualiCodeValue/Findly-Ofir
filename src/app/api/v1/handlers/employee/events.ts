import { Router, Request, Response } from 'express';
import { Op, WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { Event, EventStatus } from '../../../../models/Event';
import { EmployeeEventEntity } from '../../entities/employee/events/base';

const router = Router();
const paginator = new Paginator(20);

/**
 * @openapi
 * /v1/employee/events:
 *   get:
 *     tags: [Employee Events]
 *     summary: Browse open events the employee can apply to
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: area_id
 *         schema: { type: integer }
 *       - in: query
 *         name: category_id
 *         schema: { type: integer }
 *       - in: query
 *         name: from
 *         description: ISO date ג€” only events starting after this point
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: List of active future events
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { offset, limit } = paginator.paginate(req);
    const where: WhereOptions = {
      status: EventStatus.ACTIVE,
      startAt: { [Op.gte]: new Date() },
    };
    if (req.query.area_id) {
      (where as Record<string, unknown>).activityAreaId = parseInt(String(req.query.area_id), 10);
    }
    if (req.query.category_id) {
      (where as Record<string, unknown>).eventCategoryId = parseInt(String(req.query.category_id), 10);
    }
    if (typeof req.query.from === 'string') {
      const d = new Date(req.query.from);
      if (!Number.isNaN(d.getTime())) {
        (where as Record<string, unknown>).startAt = { [Op.gte]: d };
      }
    }

    const { rows, count } = await Event.findAndCountAll({
      where,
      include: EmployeeEventEntity.includes(req),
      offset,
      limit,
      order: [['startAt', 'ASC']],
      distinct: true,
    });

    paginator.setPaginationHeaders(req, res, rows, count);
    await renderSuccess(res, rows, EmployeeEventEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/events/{id}:
 *   get:
 *     tags: [Employee Events]
 *     summary: View a single open event
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Single event
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new APIError(400, 'Invalid id');
    const event = await Event.findOne({
      where: { id, status: EventStatus.ACTIVE },
      include: EmployeeEventEntity.includes(req),
    });
    if (!event) throw new APIError(404, 'Event not found or not open');
    await renderSuccess(res, event, EmployeeEventEntity);
  }),
);

export default router;
