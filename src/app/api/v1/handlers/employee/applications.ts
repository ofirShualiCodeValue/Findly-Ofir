import { Router, Request, Response } from 'express';
import { WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { Event, EventStatus } from '../../../../models/Event';
import {
  EventApplication,
  EventApplicationStatus,
  HoursStatus,
} from '../../../../models/EventApplication';
import { EmployeeApplicationEntity } from '../../entities/employee/applications/base';

const router = Router();
const paginator = new Paginator(50);

/**
 * @openapi
 * /v1/employee/events/{eventId}/apply:
 *   post:
 *     tags: [Employee Applications]
 *     summary: Apply to an event with a proposed amount
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proposed_amount]
 *             properties:
 *               proposed_amount: { type: number, minimum: 0 }
 *               note: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Application created
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Already applied to this event
 */
router.post(
  '/events/:eventId/apply',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const eventId = parseInt(req.params.eventId, 10);
    if (Number.isNaN(eventId)) throw new APIError(400, 'Invalid eventId');

    const proposed = req.body?.proposed_amount;
    if (proposed === undefined || proposed === null) {
      throw new APIError(400, 'proposed_amount is required');
    }
    if (Number(proposed) < 0) {
      throw new APIError(400, 'proposed_amount must be >= 0');
    }

    const event = await Event.findOne({
      where: { id: eventId, status: EventStatus.ACTIVE },
    });
    if (!event) {
      throw new APIError(404, 'Event not found or not open');
    }

    const existing = await EventApplication.findOne({
      where: { eventId, userId: currentUser.id },
    });
    if (existing) {
      throw new APIError(409, 'You have already applied to this event');
    }

    const created = await EventApplication.create({
      eventId,
      userId: currentUser.id,
      status: EventApplicationStatus.PENDING,
      proposedAmount: String(proposed),
      note: typeof req.body?.note === 'string' ? req.body.note : null,
    } as Partial<EventApplication>);

    const fresh = await EventApplication.findByPk(created.id, {
      include: EmployeeApplicationEntity.includes(req),
    });

    res.status(201);
    await renderSuccess(res, fresh, EmployeeApplicationEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/applications:
 *   get:
 *     tags: [Employee Applications]
 *     summary: List the employee's own applications
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of applications
 */
router.get(
  '/applications',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const { offset, limit } = paginator.paginate(req);
    const where: WhereOptions = { userId: currentUser.id };
    if (typeof req.query.status === 'string') {
      (where as Record<string, unknown>).status = req.query.status;
    }
    const { rows, count } = await EventApplication.findAndCountAll({
      where,
      include: EmployeeApplicationEntity.includes(req),
      offset,
      limit,
      order: [['createdAt', 'DESC']],
      distinct: true,
    });
    paginator.setPaginationHeaders(req, res, rows, count);
    await renderSuccess(res, rows, EmployeeApplicationEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/applications/{id}:
 *   delete:
 *     tags: [Employee Applications]
 *     summary: Cancel my own application
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Cancelled
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete(
  '/applications/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new APIError(400, 'Invalid id');
    const app = await EventApplication.findOne({
      where: { id, userId: req.currentUser!.id },
      include: [{ model: Event }],
    });
    if (!app) throw new APIError(404, 'Application not found');
    if (app.status === EventApplicationStatus.CANCELLED_BY_EMPLOYEE) {
      throw new APIError(400, 'Already cancelled');
    }

    // 48-hour cancellation policy. The first call returns the warning
    // payload so the Flutter "Cancellation Policy" popup can show. The
    // client confirms with `?force=true` (or { force: true } body) to
    // proceed with the cancellation despite the late notice.
    const force = req.query.force === 'true' || req.body?.force === true;
    if (app.event && !force) {
      const startMs = new Date(app.event.startAt).getTime();
      const hoursUntil = (startMs - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil > 0 && hoursUntil < 48) {
        throw new APIError(409, 'Cancellation within 48 hours of the shift', {
          code: 'CANCELLATION_POLICY_LATE',
          policy_threshold_hours: 48,
          hours_until_shift: Math.round(hoursUntil * 100) / 100,
        });
      }
    }

    await app.update({
      status: EventApplicationStatus.CANCELLED_BY_EMPLOYEE,
      decidedAt: new Date(),
    });
    const fresh = await EventApplication.findByPk(app.id, {
      include: EmployeeApplicationEntity.includes(req),
    });
    await renderSuccess(res, fresh, EmployeeApplicationEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/applications/{id}/report-hours:
 *   post:
 *     tags: [Employee Applications]
 *     summary: Report actual hours worked after a shift ended
 *     description: |
 *       Available only after the event's `end_at` has passed and the application
 *       is `approved`. Sets `hours_status` to `pending_approval` until the
 *       Employer confirms the reported hours.
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
 *           schema:
 *             type: object
 *             required: [hours]
 *             properties:
 *               hours: { type: number, minimum: 0, maximum: 24 }
 *     responses:
 *       200: { description: Hours submitted, awaiting employer approval }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: Shift not ended yet, or hours already approved }
 */
router.post(
  '/applications/:id/report-hours',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new APIError(400, 'Invalid id');

    const hours = Number(req.body?.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      throw new APIError(400, 'hours must be a number between 0 and 24');
    }

    const app = await EventApplication.findOne({
      where: { id, userId: req.currentUser!.id },
      include: [{ model: Event }],
    });
    if (!app) throw new APIError(404, 'Application not found');

    if (app.status !== EventApplicationStatus.APPROVED) {
      throw new APIError(409, 'Only approved applications can report hours');
    }
    if (app.hoursStatus === HoursStatus.APPROVED) {
      throw new APIError(409, 'Hours have already been approved by the employer');
    }
    if (!app.event || new Date(app.event.endAt).getTime() > Date.now()) {
      throw new APIError(409, 'The shift has not ended yet');
    }

    await app.update({
      reportedHours: String(hours),
      reportedAt: new Date(),
      hoursStatus: HoursStatus.PENDING_APPROVAL,
    });

    const fresh = await EventApplication.findByPk(app.id, {
      include: EmployeeApplicationEntity.includes(req),
    });
    await renderSuccess(res, fresh, EmployeeApplicationEntity);
  }),
);

export default router;
