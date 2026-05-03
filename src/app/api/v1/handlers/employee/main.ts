import { Router } from 'express';
import { authenticate, requireRole } from '../../../helpers/authentication/middleware';
import { UserRole } from '../../../../models/User';
import eventsRouter from './events';
import applicationsRouter from './applications';
import profileRouter from './profile';
import notificationsRouter from './notifications';

const router = Router();

router.use(authenticate);
router.use(requireRole(UserRole.EMPLOYEE));

router.use('/profile', profileRouter);
router.use('/notifications', notificationsRouter);
router.use('/events', eventsRouter);
router.use('/', applicationsRouter);

router.get('/', (_req, res) => {
  res.json({ app: 'employee', status: 'ok' });
});

export default router;
