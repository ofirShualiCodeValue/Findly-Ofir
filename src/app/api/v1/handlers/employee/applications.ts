import { Router, Request, Response } from 'express';
import { WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { Event } from '../../../../models/Event';
import { EventApplication } from '../../../../models/EventApplication';
import { EmployeeApplicationEntity } from '../../entities/employee/applications/base';

const router = Router();
const paginator = new Paginator(50);

// =====================================================================
// Input-validation helpers — pure shape/format checks.
// =====================================================================

function parseIdOr400(raw: string): number {
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) throw new APIError(400, 'Invalid id');
  return id;
}

function parseProposedAmountOr400(raw: unknown): number {
  if (raw === undefined || raw === null) {
    throw new APIError(400, 'proposed_amount is required');
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new APIError(400, 'proposed_amount must be >= 0');
  }
  return n;
}

function parseDateOr400(raw: unknown, field: string): Date {
  const d = new Date(raw as string);
  if (Number.isNaN(d.getTime())) {
    throw new APIError(400, `Invalid ${field}`);
  }
  return d;
}

// =====================================================================
// Routes — thin handlers: parse input → call model method → render.
// =====================================================================

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
    const eventId = parseIdOr400(req.params.eventId);
    const proposedAmount = parseProposedAmountOr400(req.body?.proposed_amount);
    const note = typeof req.body?.note === 'string' ? req.body.note : null;

    const created = await EventApplication.applyToEvent(eventId, req.currentUser!.id, {
      proposedAmount,
      note,
    });

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
    const { offset, limit } = paginator.paginate(req);
    const where: WhereOptions = { userId: req.currentUser!.id };
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
    const id = parseIdOr400(req.params.id);
    const force = req.query.force === 'true' || req.body?.force === true;

    const application = await EventApplication.findOne({
      where: { id, userId: req.currentUser!.id },
      include: [{ model: Event }],
    });
    if (!application) throw new APIError(404, 'Application not found');

    await application.cancelByEmployee({ force });

    const fresh = await EventApplication.findByPk(application.id, {
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
 *     summary: Report the actual time range worked after a shift ended
 *     description: |
 *       Available only after the event's `end_at` has passed and the application
 *       is `approved`. Sets `hours_status` to `pending_approval` until the
 *       Employer confirms the reported time range. The total `reported_hours`
 *       is computed server-side from the timestamps.
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
 *             required: [start_at, end_at]
 *             properties:
 *               start_at: { type: string, format: date-time }
 *               end_at:   { type: string, format: date-time }
 *     responses:
 *       200: { description: Time range submitted, awaiting employer approval }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: Shift not ended yet, or hours already approved }
 */
router.post(
  '/applications/:id/report-hours',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseIdOr400(req.params.id);
    if (req.body?.start_at === undefined || req.body?.end_at === undefined) {
      throw new APIError(400, 'start_at and end_at are required');
    }
    const startAt = parseDateOr400(req.body.start_at, 'start_at');
    const endAt = parseDateOr400(req.body.end_at, 'end_at');

    const application = await EventApplication.findOne({
      where: { id, userId: req.currentUser!.id },
      include: [{ model: Event }],
    });
    if (!application) throw new APIError(404, 'Application not found');

    await application.reportShiftTimes({ startAt, endAt });

    const fresh = await EventApplication.findByPk(application.id, {
      include: EmployeeApplicationEntity.includes(req),
    });
    await renderSuccess(res, fresh, EmployeeApplicationEntity);
  }),
);

export default router;
