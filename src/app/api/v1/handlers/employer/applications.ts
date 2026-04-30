import { Router, Request, Response } from 'express';
import { WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { EventApplication, EventApplicationStatus } from '../../../../models/EventApplication';
import { ApplicationBaseEntity } from '../../entities/employer/applications/base';
import { loadOwnedEvent } from '../../../helpers/events';

const router = Router({ mergeParams: true });
const paginator = new Paginator(50);

const TERMINAL_STATUSES: ReadonlySet<EventApplicationStatus> = new Set([
  EventApplicationStatus.APPROVED,
  EventApplicationStatus.REJECTED,
  EventApplicationStatus.CANCELLED_BY_EMPLOYEE,
  EventApplicationStatus.CANCELLED_BY_EMPLOYER,
]);

const EMPLOYER_DECISIONS: ReadonlySet<EventApplicationStatus> = new Set([
  EventApplicationStatus.APPROVED,
  EventApplicationStatus.REJECTED,
  EventApplicationStatus.CANCELLED_BY_EMPLOYER,
]);

/**
 * @openapi
 * /v1/employer/events/{eventId}/applications:
 *   get:
 *     tags: [Employer Applications]
 *     summary: List applicants for an owned event (paginated)
 *     security: [{ DevAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, cancelled_by_employee, cancelled_by_employer]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: List of applications with applicant user attached
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Application' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const { offset, limit } = paginator.paginate(req);

    const where: WhereOptions = { eventId: event.id };
    if (typeof req.query.status === 'string') {
      (where as Record<string, unknown>).status = req.query.status;
    }

    const { rows, count } = await EventApplication.findAndCountAll({
      where,
      include: ApplicationBaseEntity.includes(req),
      offset,
      limit,
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    paginator.setPaginationHeaders(req, res, rows, count);
    await renderSuccess(res, rows, ApplicationBaseEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/events/{eventId}/applications/{applicationId}:
 *   patch:
 *     tags: [Employer Applications]
 *     summary: Approve, reject, or cancel an application
 *     security: [{ DevAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected, cancelled_by_employer]
 *               note:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated application
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch(
  '/:applicationId',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const applicationId = parseInt(req.params.applicationId, 10);
    if (Number.isNaN(applicationId)) {
      throw new APIError(400, 'Invalid applicationId');
    }

    const application = await EventApplication.findOne({
      where: { id: applicationId, eventId: event.id },
    });
    if (!application) {
      throw new APIError(404, 'Application not found');
    }

    const { status, note } = req.body ?? {};
    if (!status || !EMPLOYER_DECISIONS.has(status)) {
      throw new APIError(
        400,
        'status must be one of: approved, rejected, cancelled_by_employer',
      );
    }

    if (
      status !== EventApplicationStatus.CANCELLED_BY_EMPLOYER &&
      TERMINAL_STATUSES.has(application.status) &&
      application.status !== EventApplicationStatus.PENDING
    ) {
      throw new APIError(400, `Cannot change status from ${application.status}`);
    }

    await application.update({
      status,
      note: note ?? application.note,
      decidedAt: new Date(),
      decidedByUserId: req.currentUser!.id,
    });

    const fresh = await EventApplication.findByPk(application.id, {
      include: ApplicationBaseEntity.includes(req),
    });

    await renderSuccess(res, fresh, ApplicationBaseEntity);
  }),
);

export default router;
