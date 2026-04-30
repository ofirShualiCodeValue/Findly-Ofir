import { Router, Request, Response } from 'express';
import { WhereOptions, Op } from 'sequelize';
import { asyncHandler } from '@monkeytech/nodejs-core/network/utils/routing';
import { renderSuccess } from '@monkeytech/nodejs-core/api/helpers/response';
import { APIError } from '@monkeytech/nodejs-core/api/errors/APIError';
import { Paginator } from '@monkeytech/nodejs-core/api/Paginator';
import { Notification, NotificationType } from '../../../../models/Notification';
import { IncomingNotificationEntity } from '../../entities/employer/notifications/incoming';

const router = Router();
const paginator = new Paginator(50);

/**
 * @openapi
 * /v1/employer/notifications:
 *   get:
 *     tags: [Employer Notifications]
 *     summary: System notifications received by the current employer (e.g. shift cancelled, application updates)
 *     security: [{ DevAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
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

    const where: WhereOptions = {
      recipientUserId: currentUser.id,
      type: { [Op.ne]: NotificationType.EVENT_MESSAGE },
    };
    if (req.query.unread === 'true') {
      (where as Record<string, unknown>).readAt = null;
    }

    const { rows, count } = await Notification.findAndCountAll({
      where,
      include: IncomingNotificationEntity.includes(req),
      offset,
      limit,
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    paginator.setPaginationHeaders(req, res, rows, count);
    await renderSuccess(res, rows, IncomingNotificationEntity);
  }),
);

/**
 * @openapi
 * /v1/employer/notifications/{id}/read:
 *   post:
 *     tags: [Employer Notifications]
 *     summary: Mark a notification as read
 *     security: [{ DevAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new APIError(400, 'Invalid notification id');

    const notification = await Notification.findOne({
      where: { id, recipientUserId: req.currentUser!.id },
    });
    if (!notification) throw new APIError(404, 'Notification not found');

    if (!notification.readAt) {
      await notification.update({ readAt: new Date() });
    }

    await renderSuccess(res, notification, IncomingNotificationEntity);
  }),
);

export default router;
