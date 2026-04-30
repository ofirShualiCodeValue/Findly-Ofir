import { Router } from 'express';
import sharedRouter from './handlers/shared/main';
import employerRouter from './handlers/employer/main';
import employeeRouter from './handlers/employee/main';

const v1Router = Router();

v1Router.use('/shared', sharedRouter);
v1Router.use('/employer', employerRouter);
v1Router.use('/employee', employeeRouter);

export default v1Router;
