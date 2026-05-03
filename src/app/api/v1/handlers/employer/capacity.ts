import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { EventApplication, EventApplicationStatus } from '../../../../models/EventApplication';
import { Shift } from '../../../../models/Shift';
import { ShiftStaffingRequirement } from '../../../../models/ShiftStaffingRequirement';
import { IndustrySubCategory } from '../../../../models/IndustrySubCategory';
import { User } from '../../../../models/User';
import { loadOwnedEvent } from '../../../helpers/events';

const router = Router({ mergeParams: true });

function capacityState(filled: number, required: number): 'under' | 'met' | 'over' {
  if (required <= 0) return filled > 0 ? 'over' : 'under';
  if (filled < required) return 'under';
  if (filled === required) return 'met';
  return 'over';
}

/**
 * @openapi
 * /v1/employer/events/{eventId}/capacity:
 *   get:
 *     tags: [Employer Capacity]
 *     summary: Capacity status for an event (event-level + per-shift breakdown)
 *     description: |
 *       Returns the running headcount per shift / per role, against the
 *       required count from staffing_requirements. Each row's `state` is one
 *       of `under` | `met` | `over`, so the UI can show "capacity reached"
 *       alerts while still allowing the employer to over-staff intentionally.
 *
 *       At the event level, `state=met` if every shift requirement is met.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Capacity breakdown }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);

    const shifts = await Shift.findAll({
      where: { eventId: event.id },
      include: [
        {
          model: ShiftStaffingRequirement,
          include: [{ model: IndustrySubCategory }],
        },
      ],
      order: [['startAt', 'ASC']],
    });

    const approvedApps = await EventApplication.findAll({
      where: { eventId: event.id, status: EventApplicationStatus.APPROVED },
      attributes: ['id', 'shiftId', 'userId'],
      include: [
        {
          model: User,
          as: 'applicant',
          include: [
            {
              model: IndustrySubCategory,
              attributes: ['id'],
              through: { attributes: [] },
            },
          ],
        },
      ],
    });

    const shiftBreakdowns = shifts.map((shift) => {
      const reqs = shift.staffingRequirements ?? [];
      const totalRequired = reqs.reduce((s, r) => s + r.requiredCount, 0);

      const filledForShift = approvedApps.filter((a) => a.shiftId === shift.id);
      const totalFilled = filledForShift.length;

      const perRole = reqs.map((r) => {
        const filled = filledForShift.filter((a) => {
          const subs = a.applicant?.industrySubCategories ?? [];
          return subs.some((s) => s.id === r.industrySubCategoryId);
        }).length;
        return {
          industry_subcategory_id: r.industrySubCategoryId,
          industry_subcategory: r.industrySubCategory
            ? {
                id: r.industrySubCategory.id,
                name: r.industrySubCategory.name,
                slug: r.industrySubCategory.slug,
              }
            : null,
          required: r.requiredCount,
          filled,
          state: capacityState(filled, r.requiredCount),
        };
      });

      return {
        shift_id: shift.id,
        start_at: shift.startAt,
        end_at: shift.endAt,
        total_required: totalRequired,
        total_filled: totalFilled,
        state: capacityState(totalFilled, totalRequired),
        per_role: perRole,
      };
    });

    const eventRequired = shiftBreakdowns.reduce((s, b) => s + b.total_required, 0);
    const eventFilled = approvedApps.length;

    res.json({
      code: 200,
      message: 'ok',
      data: {
        event_id: event.id,
        total_required: eventRequired,
        total_filled: eventFilled,
        state: capacityState(eventFilled, eventRequired),
        shifts: shiftBreakdowns,
      },
    });
  }),
);

export default router;
