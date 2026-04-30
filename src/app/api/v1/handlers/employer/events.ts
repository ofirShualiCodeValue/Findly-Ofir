import { Router, Request, Response } from 'express';
import { WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { Event, EventStatus } from '../../../../models/Event';
import { EventCategory } from '../../../../models/EventCategory';
import { ActivityArea } from '../../../../models/ActivityArea';
import { EventBaseEntity } from '../../entities/employer/events/base';
import { EventFullEntity } from '../../entities/employer/events/full';
import { loadOwnedEvent } from '../../../helpers/events';

const router = Router();
const paginator = new Paginator(20);

type EventUpdates = Partial<{
  name: string;
  description: string | null;
  venue: string | null;
  startAt: Date;
  endAt: Date;
  budget: string;
  requiredEmployees: number;
  eventCategoryId: number;
  activityAreaId: number;
  status: EventStatus;
}>;

async function assertCategoryExists(id: number): Promise<void> {
  const cat = await EventCategory.findByPk(id);
  if (!cat) throw new APIError(400, 'Invalid event_category_id');
}

async function assertAreaExists(id: number): Promise<void> {
  const area = await ActivityArea.findByPk(id);
  if (!area) throw new APIError(400, 'Invalid activity_area_id');
}

function parseDateOr400(value: unknown, field: string): Date {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) {
    throw new APIError(400, `Invalid ${field}`);
  }
  return d;
}

function assertNonNegative(value: unknown, field: string): void {
  if (Number(value) < 0) throw new APIError(400, `${field} must be >= 0`);
}

function assertPositive(value: unknown, field: string): void {
  if (Number(value) < 1) throw new APIError(400, `${field} must be >= 1`);
}

/**
 * @openapi
 * /v1/employer/events:
 *   post:
 *     tags: [Employer Events]
 *     summary: Create a new event owned by the current employer
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateEventInput' }
 *     responses:
 *       201:
 *         description: Event created with eager-loaded category and area
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/EventFull' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const body = req.body ?? {};

    const required = ['name', 'event_category_id', 'activity_area_id', 'start_at', 'end_at'];
    const missing = required.filter(
      (k) => body[k] === undefined || body[k] === null || body[k] === '',
    );
    if (missing.length) {
      throw new APIError(400, `Missing fields: ${missing.join(', ')}`);
    }

    const startAt = parseDateOr400(body.start_at, 'start_at');
    const endAt = parseDateOr400(body.end_at, 'end_at');
    if (endAt <= startAt) {
      throw new APIError(400, 'end_at must be after start_at');
    }

    if (body.budget !== undefined) assertNonNegative(body.budget, 'budget');
    if (body.required_employees !== undefined)
      assertPositive(body.required_employees, 'required_employees');

    await Promise.all([
      assertCategoryExists(body.event_category_id),
      assertAreaExists(body.activity_area_id),
    ]);

    const created = await Event.create({
      createdByUserId: currentUser.id,
      eventCategoryId: body.event_category_id,
      activityAreaId: body.activity_area_id,
      name: body.name,
      description: body.description ?? null,
      venue: body.venue ?? null,
      startAt,
      endAt,
      budget: body.budget !== undefined ? String(body.budget) : '0',
      requiredEmployees: body.required_employees ?? 1,
      status: body.status ?? EventStatus.DRAFT,
    } as Partial<Event>);

    const fresh = await Event.findByPk(created.id, {
      include: EventFullEntity.includes(req),
    });

    res.status(201);
    await renderSuccess(res, fresh, EventFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/events:
 *   get:
 *     tags: [Employer Events]
 *     summary: List events owned by the current employer (paginated, newest first)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { $ref: '#/components/schemas/EventStatus' }
 *     responses:
 *       200:
 *         description: Paginated list (X-Total / X-Page headers set)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/EventBase' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const { offset, limit } = paginator.paginate(req);

    const where: WhereOptions = { createdByUserId: currentUser.id };
    if (typeof req.query.status === 'string') {
      (where as Record<string, unknown>).status = req.query.status;
    }

    const { rows, count } = await Event.findAndCountAll({
      where,
      include: EventBaseEntity.includes(req),
      offset,
      limit,
      order: [['startAt', 'DESC']],
      distinct: true,
    });

    paginator.setPaginationHeaders(req, res, rows, count);
    await renderSuccess(res, rows, EventBaseEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/events/{id}:
 *   get:
 *     tags: [Employer Events]
 *     summary: Get a single event by id (must be owned by current employer)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Full event
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/EventFull' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.id, EventFullEntity.includes(req));
    await renderSuccess(res, event, EventFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/events/{id}:
 *   patch:
 *     tags: [Employer Events]
 *     summary: Partially update an owned event (cannot edit cancelled events)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateEventInput' }
 *     responses:
 *       200:
 *         description: Updated event
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/EventFull' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.id);

    if (event.status === EventStatus.CANCELLED) {
      throw new APIError(400, 'Cannot edit a cancelled event');
    }

    const body = req.body ?? {};
    const updates: EventUpdates = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.venue !== undefined) updates.venue = body.venue;
    if (body.budget !== undefined) {
      assertNonNegative(body.budget, 'budget');
      updates.budget = String(body.budget);
    }
    if (body.required_employees !== undefined) {
      assertPositive(body.required_employees, 'required_employees');
      updates.requiredEmployees = body.required_employees;
    }
    if (body.start_at !== undefined) {
      updates.startAt = parseDateOr400(body.start_at, 'start_at');
    }
    if (body.end_at !== undefined) {
      updates.endAt = parseDateOr400(body.end_at, 'end_at');
    }
    if (body.event_category_id !== undefined) {
      await assertCategoryExists(body.event_category_id);
      updates.eventCategoryId = body.event_category_id;
    }
    if (body.activity_area_id !== undefined) {
      await assertAreaExists(body.activity_area_id);
      updates.activityAreaId = body.activity_area_id;
    }
    if (body.status !== undefined) {
      if (!Object.values(EventStatus).includes(body.status)) {
        throw new APIError(400, 'Invalid status');
      }
      updates.status = body.status;
    }

    const finalStart = updates.startAt ?? event.startAt;
    const finalEnd = updates.endAt ?? event.endAt;
    if (finalEnd <= finalStart) {
      throw new APIError(400, 'end_at must be after start_at');
    }

    await event.update(updates);

    const fresh = await Event.findByPk(event.id, {
      include: EventFullEntity.includes(req),
    });

    await renderSuccess(res, fresh, EventFullEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/events/{id}:
 *   delete:
 *     tags: [Employer Events]
 *     summary: Cancel an event (soft ג€” sets status to 'cancelled', does not remove the row)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Event marked as cancelled
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/EventFull' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.id);

    if (event.status === EventStatus.CANCELLED) {
      throw new APIError(400, 'Event already cancelled');
    }

    await event.update({ status: EventStatus.CANCELLED });

    const fresh = await Event.findByPk(event.id, {
      include: EventFullEntity.includes(req),
    });

    await renderSuccess(res, fresh, EventFullEntity);
  }),
);

export default router;
