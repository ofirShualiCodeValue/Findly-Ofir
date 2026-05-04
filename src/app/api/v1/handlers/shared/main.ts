import { Router } from 'express';
import { authenticate } from '../../../helpers/authentication/middleware';
import authRouter from './auth';
import categoriesRouter from './categories';
import areasRouter from './areas';
import industriesRouter from './industries';
import certificationsRouter from './certifications';

const router = Router();

router.use('/auth', authRouter);

// Authenticated taxonomy lookups available to both roles.
router.use('/categories', authenticate, categoriesRouter);
router.use('/areas', authenticate, areasRouter);
router.use('/industries', authenticate, industriesRouter);
router.use('/certifications', authenticate, certificationsRouter);

router.get('/', (_req, res) => {
  res.json({ app: 'shared', status: 'ok' });
});

export default router;
