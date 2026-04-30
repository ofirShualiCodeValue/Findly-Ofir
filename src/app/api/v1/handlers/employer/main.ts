import { Router } from 'express';
import { authenticate, requireRole } from '../../../helpers/authentication/middleware';
import { UserRole } from '../../../../models/User';
import profileRouter from './profile';
import eventsRouter from './events';
import categoriesRouter from './categories';
import areasRouter from './areas';
import applicationsRouter from './applications';
import eventNotificationsRouter from './event-notifications';
import notificationsRouter from './notifications';

const router = Router();

router.use(authenticate);
router.use(requireRole(UserRole.EMPLOYER));

router.use('/profile', profileRouter);
router.use('/events/:eventId/applications', applicationsRouter);
router.use('/events/:eventId/notifications', eventNotificationsRouter);
router.use('/events', eventsRouter);
router.use('/categories', categoriesRouter);
router.use('/areas', areasRouter);
router.use('/notifications', notificationsRouter);

router.get('/', (_req, res) => {
  res.json({ app: 'employer', status: 'ok' });
});

export default router;
