import { Router, Request, Response } from 'express';
import { Op, WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { Event, EventStatus } from '../../../../models/Event';
import { EmployeeProfile } from '../../../../models/EmployeeProfile';
import { UserIndustrySubCategory } from '../../../../models/UserIndustrySubCategory';
import { EventApplication } from '../../../../models/EventApplication';
import { EventInterest, EventInterestStatus } from '../../../../models/EventInterest';
import { Shift } from '../../../../models/Shift';
import { ShiftStaffingRequirement } from '../../../../models/ShiftStaffingRequirement';
import { EmployeeEventEntity } from '../../entities/employee/events/base';
import { haversineDistanceKm } from '../../../../../services/allowances';

const router = Router();
const paginator = new Paginator(20);

interface MatchingFilters {
  subCategoryIds: number[];
  rangeKm: number | null;
  baseRate: number | null;
  homeLat: number | null;
  homeLng: number | null;
  dismissedEventIds: number[];
  appliedEventIds: number[];
}

async function loadMatchingFilters(userId: number): Promise<MatchingFilters> {
  const [profile, subs, dismissed, applied] = await Promise.all([
    EmployeeProfile.findOne({ where: { userId } }),
    UserIndustrySubCategory.findAll({ where: { userId }, attributes: ['industrySubCategoryId'] }),
    EventInterest.findAll({
      where: { userId, status: EventInterestStatus.NOT_INTERESTED },
      attributes: ['eventId'],
    }),
    EventApplication.findAll({ where: { userId }, attributes: ['eventId'] }),
  ]);

  return {
    subCategoryIds: subs.map(
      (s) => (s as unknown as { industrySubCategoryId: number }).industrySubCategoryId,
    ),
    rangeKm: profile?.locationRangeKm ?? null,
    baseRate: profile?.baseHourlyRate ? Number(profile.baseHourlyRate) : null,
    homeLat: profile?.homeLatitude ? Number(profile.homeLatitude) : null,
    homeLng: profile?.homeLongitude ? Number(profile.homeLongitude) : null,
    dismissedEventIds: dismissed.map((d) => (d as unknown as { eventId: number }).eventId),
    appliedEventIds: applied.map((a) => (a as unknown as { eventId: number }).eventId),
  };
}

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
 *     summary: Employee feed — Job Offers tab (default) or My Shifts tab
 *     description: |
 *       The Figma's two-tab UI on the employee home maps to this endpoint:
 *       - `tab=offers` (default): events that match the employee (industry
 *         sub-category, location range, base rate) and that they haven't
 *         dismissed or already applied to.
 *       - `tab=shifts`: events the employee has an application on, regardless
 *         of status — drives the "המשמרות שלי" tab.
 *       Pass `match=off` on the offers tab to bypass the matcher (debug).
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tab
 *         schema: { type: string, enum: [offers, shifts], default: offers }
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
 *       200: { description: List of events }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const tab = req.query.tab === 'shifts' ? 'shifts' : 'offers';
    const matchEnabled = req.query.match !== 'off';
    const { offset, limit } = paginator.paginate(req);

    if (tab === 'shifts') {
      // My Shifts: every event with an application of mine, newest first.
      const apps = await EventApplication.findAll({
        where: { userId: currentUser.id },
        order: [['createdAt', 'DESC']],
        attributes: ['eventId'],
      });
      const eventIds = apps.map((a) => a.eventId);
      if (!eventIds.length) {
        paginator.setPaginationHeaders(req, res, [], 0);
        await renderSuccess(res, [], EmployeeEventEntity);
        return;
      }
      const { rows, count } = await Event.findAndCountAll({
        where: { id: eventIds },
        include: EmployeeEventEntity.includes(req),
        offset,
        limit,
        order: [['startAt', 'ASC']],
        distinct: true,
      });
      paginator.setPaginationHeaders(req, res, rows, count);
      await renderSuccess(res, rows, EmployeeEventEntity);
      return;
    }

    // Job Offers tab.
    const where: WhereOptions = {
      status: EventStatus.ACTIVE,
      startAt: { [Op.gte]: new Date() },
    };

    let filters: MatchingFilters | null = null;
    if (matchEnabled) {
      filters = await loadMatchingFilters(currentUser.id);

      // Match the employee against the union of two sources, since events
      // may declare their role either at the event level (industry_subcategory_id)
      // or — more commonly in practice — on individual shifts via
      // shift_staffing_requirements. Either path counts as a match.
      const matchingEventIds = new Set<number>();
      if (filters.subCategoryIds.length) {
        const eventsBySub = await Event.findAll({
          where: { industrySubCategoryId: { [Op.in]: filters.subCategoryIds } },
          attributes: ['id'],
        });
        for (const e of eventsBySub) matchingEventIds.add(e.id);

        const shiftsByReq = await Shift.findAll({
          attributes: ['eventId'],
          include: [
            {
              model: ShiftStaffingRequirement,
              required: true,
              where: { industrySubCategoryId: { [Op.in]: filters.subCategoryIds } },
              attributes: [],
            },
          ],
        });
        for (const s of shiftsByReq) matchingEventIds.add(s.eventId);

        // No matches at all → short-circuit with empty result.
        if (matchingEventIds.size === 0) {
          paginator.setPaginationHeaders(req, res, [], 0);
          await renderSuccess(res, [], EmployeeEventEntity);
          return;
        }
        (where as Record<string, unknown>).id = { [Op.in]: [...matchingEventIds] };
      }

      const exclude = [...new Set([...filters.dismissedEventIds, ...filters.appliedEventIds])];
      if (exclude.length) {
        const previous = (where as Record<string, unknown>).id as { [Op.in]?: number[] } | undefined;
        const allowed = previous?.[Op.in] ?? null;
        if (allowed) {
          (where as Record<string, unknown>).id = {
            [Op.in]: allowed.filter((id) => !exclude.includes(id)),
          };
        } else {
          (where as Record<string, unknown>).id = { [Op.notIn]: exclude };
        }
      }
    }

    const candidates = await Event.findAll({
      where,
      include: EmployeeEventEntity.includes(req),
      order: [['startAt', 'ASC']],
    });

    const filtered = filters
      ? candidates.filter((event) => {
          if (filters!.rangeKm !== null && filters!.homeLat !== null && filters!.homeLng !== null) {
            // Try the event's coords first; fall back to the employer's
            // business address. If neither exists we can't measure
            // distance — let the event through rather than silently drop it.
            const eventLat = event.latitude !== null ? Number(event.latitude) : null;
            const eventLng = event.longitude !== null ? Number(event.longitude) : null;
            const employerLat = event.creator?.employerProfile?.latitude;
            const employerLng = event.creator?.employerProfile?.longitude;
            const lat = eventLat ?? (employerLat !== null && employerLat !== undefined ? Number(employerLat) : null);
            const lng = eventLng ?? (employerLng !== null && employerLng !== undefined ? Number(employerLng) : null);
            if (lat !== null && lng !== null) {
              const distance = haversineDistanceKm(filters!.homeLat, filters!.homeLng, lat, lng);
              if (distance > filters!.rangeKm) return false;
            }
            // No coords anywhere → skip distance filter for this event.
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
 *     security: [{ BearerAuth: [] }]
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
