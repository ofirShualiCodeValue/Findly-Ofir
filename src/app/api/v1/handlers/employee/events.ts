import { Router, Request, Response } from 'express';
import { Op, WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { Event, EventStatus } from '../../../../models/Event';
import { EmployeeProfile } from '../../../../models/EmployeeProfile';
import { EmployerEventCategory } from '../../../../models/EmployerEventCategory';
import { EventInterest, EventInterestStatus } from '../../../../models/EventInterest';
import { EmployeeEventEntity } from '../../entities/employee/events/base';
import { haversineDistanceKm } from '../../../../../services/allowances';

const router = Router();
const paginator = new Paginator(20);

interface MatchingFilters {
  industryIds: number[];
  rangeKm: number | null;
  baseRate: number | null;
  homeLat: number | null;
  homeLng: number | null;
  dismissedEventIds: number[];
}

async function loadMatchingFilters(userId: number): Promise<MatchingFilters> {
  const [profile, industries, dismissed] = await Promise.all([
    EmployeeProfile.findOne({ where: { userId } }),
    EmployerEventCategory.findAll({ where: { userId } as never, attributes: ['eventCategoryId'] }),
    EventInterest.findAll({
      where: { userId, status: EventInterestStatus.NOT_INTERESTED },
      attributes: ['eventId'],
    }),
  ]);

  return {
    industryIds: industries.map((i) => (i as unknown as { eventCategoryId: number }).eventCategoryId),
    rangeKm: profile?.locationRangeKm ?? null,
    baseRate: profile?.baseHourlyRate ? Number(profile.baseHourlyRate) : null,
    homeLat: profile?.homeLatitude ? Number(profile.homeLatitude) : null,
    homeLng: profile?.homeLongitude ? Number(profile.homeLongitude) : null,
    dismissedEventIds: dismissed.map((d) => (d as unknown as { eventId: number }).eventId),
  };
}

/**
 * Estimated hourly rate for an event = budget / required_employees / shift_hours.
 * Used to compare against the employee's `base_hourly_rate`. Returns null when
 * the event lacks a sane shift duration.
 */
function estimateEventHourlyRate(event: Event): number | null {
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();
  const hours = (end - start) / (1000 * 60 * 60);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const budget = Number(event.budget);
  const slots = event.requiredEmployees > 0 ? event.requiredEmployees : 1;
  if (!Number.isFinite(budget)) return null;
  return budget / slots / hours;
}

/**
 * @openapi
 * /v1/employee/events:
 *   get:
 *     tags: [Employee Events]
 *     summary: Browse open events that match the employee
 *     description: |
 *       Job Offers feed. By default the response is filtered down to events that match
 *       the employee's industries, are within their `location_range_km`, pay at or above
 *       their `base_hourly_rate`, and have not been dismissed via "Not Interested".
 *       Pass `match=off` to bypass all matching filters.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: match
 *         schema: { type: string, enum: [on, off], default: on }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: List of matching active future events }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const matchEnabled = req.query.match !== 'off';
    const { offset, limit } = paginator.paginate(req);

    const where: WhereOptions = {
      status: EventStatus.ACTIVE,
      startAt: { [Op.gte]: new Date() },
    };

    let filters: MatchingFilters | null = null;
    if (matchEnabled) {
      filters = await loadMatchingFilters(currentUser.id);
      if (filters.industryIds.length) {
        (where as Record<string, unknown>).eventCategoryId = { [Op.in]: filters.industryIds };
      }
      if (filters.dismissedEventIds.length) {
        (where as Record<string, unknown>).id = { [Op.notIn]: filters.dismissedEventIds };
      }
    }

    // Stage 1: SQL-level filtering (industry + dismissed). Stage 2 (distance + rate)
    // happens in JS because the budget→hourly conversion and Haversine distance
    // are not expressible cleanly in vanilla SQL without GEO extensions.
    const candidates = await Event.findAll({
      where,
      include: EmployeeEventEntity.includes(req),
      order: [['startAt', 'ASC']],
    });

    const filtered = filters
      ? candidates.filter((event) => {
          if (filters!.rangeKm !== null && filters!.homeLat !== null && filters!.homeLng !== null) {
            if (event.latitude === null || event.longitude === null) return false;
            const distance = haversineDistanceKm(
              filters!.homeLat,
              filters!.homeLng,
              Number(event.latitude),
              Number(event.longitude),
            );
            if (distance > filters!.rangeKm) return false;
          }
          if (filters!.baseRate !== null) {
            const rate = estimateEventHourlyRate(event);
            if (rate !== null && rate < filters!.baseRate) return false;
          }
          return true;
        })
      : candidates;

    const page = filtered.slice(offset, offset + limit);
    paginator.setPaginationHeaders(req, res, page, filtered.length);
    await renderSuccess(res, page, EmployeeEventEntity);
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
 *       200: { description: Single event }
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

/**
 * @openapi
 * /v1/employee/events/{id}/interest:
 *   post:
 *     tags: [Employee Events]
 *     summary: Mark Interested or Not Interested in an event
 *     description: |
 *       Upserts the employee's interest on the event. "Not Interested" hides
 *       the event from future feed loads. "Interested" is informational —
 *       a formal application still goes through `POST /events/{id}/apply`.
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [interested, not_interested] }
 *     responses:
 *       200: { description: Interest stored }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/:id/interest',
  asyncHandler(async (req: Request, res: Response) => {
    const eventId = parseInt(req.params.id, 10);
    if (Number.isNaN(eventId)) throw new APIError(400, 'Invalid event id');

    const status = req.body?.status as EventInterestStatus | undefined;
    if (!status || !Object.values(EventInterestStatus).includes(status)) {
      throw new APIError(
        400,
        `status must be one of: ${Object.values(EventInterestStatus).join(', ')}`,
      );
    }

    const event = await Event.findOne({ where: { id: eventId, status: EventStatus.ACTIVE } });
    if (!event) throw new APIError(404, 'Event not found or not open');

    const userId = req.currentUser!.id;
    const existing = await EventInterest.findOne({ where: { userId, eventId } });
    if (existing) {
      await existing.update({ status });
    } else {
      await EventInterest.create({ userId, eventId, status } as Partial<EventInterest>);
    }

    res.json({
      code: 200,
      message: 'ok',
      data: { event_id: eventId, status },
    });
  }),
);

export default router;
