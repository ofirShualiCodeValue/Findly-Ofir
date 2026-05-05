import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { loadOwnedEvent } from '../../../helpers/events';

const router = Router({ mergeParams: true });

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
    const data = await event.capacityBreakdown();
    res.json({ code: 200, message: 'ok', data });
  }),
);

export default router;
