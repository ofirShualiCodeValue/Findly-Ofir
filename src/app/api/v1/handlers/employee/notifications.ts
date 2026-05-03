import { Router, Request, Response } from 'express';
import { WhereOptions } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { Notification, NotificationType } from '../../../../models/Notification';
import { EmployeeNotificationEntity } from '../../entities/employee/notifications/incoming';

const router = Router();
const paginator = new Paginator(50);

/**
 * @openapi
 * /v1/employee/notifications:
 *   get:
 *     tags: [Employee Notifications]
 *     summary: All inbound notifications, including employer broadcasts (one-way announcements)
 *     description: |
 *       Returns the worker's full inbox — application status changes, shift
 *       reminders, and the broadcast `event_message`s sent by employers via
 *       POST /v1/employer/events/:eventId/notifications. Filter with
 *       `?type=event_message` to fetch only the announcements feed.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [event_message, application_approved, application_rejected, shift_reminder, shift_ended, employee_cancelled, event_cancelled, system]
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: List of notifications, newest first
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const currentUser = req.currentUser!;
    const { offset, limit } = paginator.paginate(req);

    const where: WhereOptions = { recipientUserId: currentUser.id };
    if (req.query.unread === 'true') {
      (where as Record<string, unknown>).readAt = null;
    }
    if (typeof req.query.type === 'string') {
      const t = req.query.type as NotificationType;
      if (Object.values(NotificationType).includes(t)) {
        (where as Record<string, unknown>).type = t;
      }
    }

    const { rows, count } = await Notification.findAndCountAll({
      where,
      include: EmployeeNotificationEntity.includes(req),
      offset,
      limit,
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    paginator.setPaginationHeaders(req, res, rows, count);
    await renderSuccess(res, rows, EmployeeNotificationEntity);
  }),
);

/**
 * @openapi
 * /v1/employee/notifications/{id}/read:
 *   post:
 *     tags: [Employee Notifications]
 *     summary: Mark a notification as read
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Notification marked as read }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new APIError(400, 'Invalid notification id');

    const notification = await Notification.findOne({
      where: { id, recipientUserId: req.currentUser!.id },
      include: EmployeeNotificationEntity.includes(req),
    });
    if (!notification) throw new APIError(404, 'Notification not found');

    if (!notification.readAt) {
      await notification.update({ readAt: new Date() });
    }

    await renderSuccess(res, notification, EmployeeNotificationEntity);
  }),
);

export default router;
