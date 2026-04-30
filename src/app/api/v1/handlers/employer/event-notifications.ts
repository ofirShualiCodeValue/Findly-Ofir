import { randomUUID } from 'node:crypto';
import { Router, Request, Response } from 'express';
import { fn, col } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { EventApplication, EventApplicationStatus } from '../../../../models/EventApplication';
import { Notification, NotificationType } from '../../../../models/Notification';
import { loadOwnedEvent } from '../../../helpers/events';

const router = Router({ mergeParams: true });

/**
 * @openapi
 * /v1/employer/events/{eventId}/notifications:
 *   post:
 *     tags: [Employer Event Notifications]
 *     summary: Send a message to all approved employees of the event
 *     security: [{ DevAuth: [] }]
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
 *             required: [title]
 *             properties:
 *               title: { type: string, maxLength: 255 }
 *               body: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Message dispatched
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message_group_id: { type: string, format: uuid }
 *                         recipient_count: { type: integer }
 *                         sent_at: { type: string, format: date-time }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const { title, body } = req.body ?? {};

    if (typeof title !== 'string' || !title.trim()) {
      throw new APIError(400, 'title is required');
    }

    const approvedApplications = await EventApplication.findAll({
      where: { eventId: event.id, status: EventApplicationStatus.APPROVED },
      attributes: ['userId'],
    });

    const recipientIds = approvedApplications.map((a) => a.userId);
    if (!recipientIds.length) {
      throw new APIError(400, 'No approved employees to notify');
    }

    const messageGroupId = randomUUID();
    const sentAt = new Date();

    const rows = recipientIds.map((userId) => ({
      recipientUserId: userId,
      senderUserId: req.currentUser!.id,
      eventId: event.id,
      type: NotificationType.EVENT_MESSAGE,
      title: title.trim(),
      body: typeof body === 'string' ? body : null,
      messageGroupId,
      meta: null,
      readAt: null,
      createdAt: sentAt,
      updatedAt: sentAt,
    }));

    await Notification.bulkCreate(rows as never);

    res.status(201);
    res.json({
      code: 201,
      message: 'ok',
      data: {
        message_group_id: messageGroupId,
        recipient_count: recipientIds.length,
        sent_at: sentAt.toISOString(),
      },
    });
  }),
);

interface MessageGroupRow {
  message_group_id: string;
  title: string;
  body: string | null;
  sent_at: string;
  recipient_count: string;
}

/**
 * @openapi
 * /v1/employer/events/{eventId}/notifications:
 *   get:
 *     tags: [Employer Event Notifications]
 *     summary: History of messages sent for an event (one entry per send)
 *     security: [{ DevAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Aggregated by message_group_id, newest first
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           message_group_id: { type: string, format: uuid }
 *                           title: { type: string }
 *                           body: { type: string, nullable: true }
 *                           sent_at: { type: string, format: date-time }
 *                           recipient_count: { type: integer }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const event = await loadOwnedEvent(req, req.params.eventId);

    const groups = (await Notification.findAll({
      where: {
        eventId: event.id,
        type: NotificationType.EVENT_MESSAGE,
      },
      attributes: [
        [col('message_group_id'), 'message_group_id'],
        [col('title'), 'title'],
        [col('body'), 'body'],
        [fn('MIN', col('created_at')), 'sent_at'],
        [fn('COUNT', col('id')), 'recipient_count'],
      ],
      group: ['message_group_id', 'title', 'body'],
      order: [[fn('MIN', col('created_at')), 'DESC']],
      raw: true,
    })) as unknown as MessageGroupRow[];

    const data = groups.map((g) => ({
      message_group_id: g.message_group_id,
      title: g.title,
      body: g.body,
      sent_at: g.sent_at,
      recipient_count: parseInt(g.recipient_count, 10),
    }));

    res.json({ code: 200, message: 'ok', data });
  }),
);

export default router;
