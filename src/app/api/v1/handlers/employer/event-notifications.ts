import { Router, Request, Response } from 'express';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Notification } from '../../../../models/Notification';
import { loadOwnedEvent } from '../../../helpers/events';

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /v1/employer/events/{eventId}/notifications:
 *   post:
 *     tags: [Employer Event Notifications]
 *     summary: Send a message to all approved employees of the event
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const title = req.body?.title;
    const body = req.body?.body;

    if (typeof title !== 'string' || !title.trim()) {
      throw new APIError(400, 'title is required');
    }

    const data = await Notification.broadcastForEvent(
      event.id,
      req.currentUser!.id,
      title.trim(),
      typeof body === 'string' ? body : null,
    );

    res.status(201);
    res.json({ code: 201, message: 'ok', data });
  }),
);

/**
 * @openapi
 * /v1/employer/events/{eventId}/notifications:
 *   get:
 *     tags: [Employer Event Notifications]
 *     summary: History of messages sent for an event (one entry per send)
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const data = await Notification.broadcastHistoryForEvent(event.id);
    res.json({ code: 200, message: 'ok', data });
  }),
);

export default router;
