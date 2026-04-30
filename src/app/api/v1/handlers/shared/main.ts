import { Router } from 'express';
import authRouter from './auth';

const router = Router();

router.use('/auth', authRouter);

router.get('/', (_req, res) => {
  res.json({ app: 'shared', status: 'ok' });
});

export default router;
