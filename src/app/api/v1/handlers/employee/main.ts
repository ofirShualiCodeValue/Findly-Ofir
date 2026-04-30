import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ app: 'employee', status: 'ok' });
});

export default router;
