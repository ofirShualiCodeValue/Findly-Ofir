import { Router } from 'express';
import { authenticate, requireRole } from '../../../helpers/authentication/middleware';
import { UserRole } from '../../../../models/User';
import eventsRouter from './events';
import applicationsRouter from './applications';

const router = Router();

router.use(authenticate);
router.use(requireRole(UserRole.EMPLOYEE));

router.use('/events', eventsRouter);
router.use('/', applicationsRouter);

router.get('/', (_req, res) => {
  res.json({ app: 'employee', status: 'ok' });
});

export default router;
