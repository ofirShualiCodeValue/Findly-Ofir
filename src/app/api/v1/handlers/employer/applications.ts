import { Router, Request, Response } from 'express';
import { Op, WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { EventApplication, EventApplicationStatus } from '../../../../models/EventApplication';
import { WorkerRating } from '../../../../models/WorkerRating';
import { Event } from '../../../../models/Event';
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
 * Average a worker's ratings (1–5). Returns null when the worker has no
 * ratings yet — caller decides how to render that.
 */
async function averageRatingFor(userId: number): Promise<{ avg: number | null; count: number }> {
  const ratings = await WorkerRating.findAll({
    where: { workerUserId: userId },
    attributes: ['rating'],
  });
  if (!ratings.length) return { avg: null, count: 0 };
  const sum = ratings.reduce((s, r) => s + r.rating, 0);
  return { avg: Math.round((sum / ratings.length) * 100) / 100, count: ratings.length };
}

/**
 * @openapi
 * /v1/employer/events/{eventId}/applications:
 *   get:
 *     tags: [Employer Applications]
 *     summary: List applicants for an owned event (filterable + paginated)
 *     description: |
 *       Supports filtering by status, proposed_amount range, and minimum
 *       average worker rating. Each row is enriched with `worker_rating`
 *       (avg + count) so the UI can show stars without a second round-trip.
 *     security: [{ BearerAuth: [] }]
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
 *         name: min_price
 *         schema: { type: number }
 *       - in: query
 *         name: max_price
 *         schema: { type: number }
 *       - in: query
 *         name: min_rating
 *         schema: { type: number, minimum: 1, maximum: 5 }
 *       - in: query
 *         name: sort_by
 *         schema: { type: string, enum: [created_at, price, rating], default: created_at }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Applications with applicant + rating summary
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);

    const where: WhereOptions = { eventId: event.id };
    if (typeof req.query.status === 'string') {
      (where as Record<string, unknown>).status = req.query.status;
    }

    const minPrice = req.query.min_price !== undefined ? Number(req.query.min_price) : undefined;
    const maxPrice = req.query.max_price !== undefined ? Number(req.query.max_price) : undefined;
    if (minPrice !== undefined || maxPrice !== undefined) {
      const range: Record<symbol, number> = {};
      if (minPrice !== undefined && Number.isFinite(minPrice)) range[Op.gte] = minPrice;
      if (maxPrice !== undefined && Number.isFinite(maxPrice)) range[Op.lte] = maxPrice;
      (where as Record<string, unknown>).proposedAmount = range;
    }

    const minRating = req.query.min_rating !== undefined ? Number(req.query.min_rating) : undefined;
    const sortBy = (req.query.sort_by as string | undefined) ?? 'created_at';

    // Sort handled in SQL for created_at + price; rating sort needs the
    // computed average, which is post-join.
    const sqlOrder: [string, 'ASC' | 'DESC'][] =
      sortBy === 'price'
        ? [['proposedAmount', 'ASC']]
        : [['createdAt', 'DESC']];

    const all = await EventApplication.findAll({
      where,
      include: ApplicationBaseEntity.includes(req),
      order: sqlOrder,
    });

    const enriched = await Promise.all(
      all.map(async (a) => {
        const r = await averageRatingFor(a.userId);
        return { application: a, rating: r };
      }),
    );

    let filtered = enriched;
    if (minRating !== undefined && Number.isFinite(minRating)) {
      filtered = enriched.filter((e) => (e.rating.avg ?? 0) >= minRating);
    }
    if (sortBy === 'rating') {
      filtered.sort((a, b) => (b.rating.avg ?? 0) - (a.rating.avg ?? 0));
    }

    const { offset, limit } = paginator.paginate(req);
    const page = filtered.slice(offset, offset + limit);
    paginator.setPaginationHeaders(req, res, page, filtered.length);

    // Render once via the entity, then mix the rating onto each row.
    const rendered = await Promise.all(
      page.map(async (e) => {
        const base = await new ApplicationBaseEntity(e.application, req).represent();
        return {
          ...(base as Record<string, unknown>),
          worker_rating: { avg: e.rating.avg, count: e.rating.count },
        };
      }),
    );
    res.json({ code: 200, message: 'ok', data: rendered });
  }),
);

/**
 * @openapi
 * /v1/employer/events/{eventId}/applications/{applicationId}:
 *   patch:
 *     tags: [Employer Applications]
 *     summary: Approve, reject, or cancel an application
 *     security: [{ BearerAuth: [] }]
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

/**
 * @openapi
 * /v1/employer/events/{eventId}/applications/{applicationId}/rating:
 *   put:
 *     tags: [Employer Applications]
 *     summary: Rate the worker (1–5) after the shift ends
 *     description: |
 *       Idempotent: re-calling updates the rating instead of creating a
 *       duplicate. Allowed only on approved applications whose event has
 *       already ended.
 *     security: [{ BearerAuth: [] }]
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
 *             required: [rating]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string, nullable: true }
 *     responses:
 *       200: { description: Rating saved }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: Cannot rate a worker before the shift has ended }
 */
router.put(
  '/:applicationId/rating',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const applicationId = parseInt(req.params.applicationId, 10);
    if (Number.isNaN(applicationId)) throw new APIError(400, 'Invalid applicationId');

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new APIError(400, 'rating must be an integer between 1 and 5');
    }
    const comment = typeof req.body?.comment === 'string' ? req.body.comment : null;

    const application = await EventApplication.findOne({
      where: { id: applicationId, eventId: event.id },
      include: [{ model: Event }],
    });
    if (!application) throw new APIError(404, 'Application not found');
    if (application.status !== EventApplicationStatus.APPROVED) {
      throw new APIError(409, 'Only approved applications can be rated');
    }
    if (!application.event || new Date(application.event.endAt).getTime() > Date.now()) {
      throw new APIError(409, 'The shift has not ended yet');
    }

    const existing = await WorkerRating.findOne({
      where: { eventApplicationId: application.id },
    });
    if (existing) {
      await existing.update({ rating, comment });
    } else {
      await WorkerRating.create({
        workerUserId: application.userId,
        ratedByUserId: req.currentUser!.id,
        eventApplicationId: application.id,
        rating,
        comment,
      } as Partial<WorkerRating>);
    }

    const summary = await averageRatingFor(application.userId);
    res.json({
      code: 200,
      message: 'ok',
      data: {
        application_id: application.id,
        worker_user_id: application.userId,
        rating,
        comment,
        worker_rating: summary,
      },
    });
  }),
);

export default router;
