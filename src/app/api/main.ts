import { Router } from 'express';

import employerRouter from './v1/handlers/employer/main';
import employeeRouter from './v1/handlers/employee/main';
import sharedRouter from './v1/handlers/shared/main';

const router = Router();

router.use('/shared', sharedRouter);
router.use('/employer', employerRouter);
router.use('/employee', employeeRouter);

export default router;
