import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ app: 'shared', status: 'ok' });
});

export default router;
