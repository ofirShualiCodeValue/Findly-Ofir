import '../config';
import 'reflect-metadata';
import express, { Express, Request, Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { getErrorHandler } from '@monkeytech/nodejs-core/network/errors/middleware';

import config from '../config';
import corsOptions from './config/cors';
import mountApi from './app/api/main';
import { apiDataMapper, friendlySequelizeMapper } from './app/api/helpers/errors';

const app: Express = express();
const env = config.get('env');

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (env !== 'test') {
  app.use(morgan(env === 'development' ? 'dev' : 'combined'));
}

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe
 *     security: []
 *     responses:
 *       200:
 *         description: Server is alive
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Mount all APIs (static uploads, swagger, /v1)
mountApi(app);

// `apiDataMapper` runs before core's apiErrorMapper so error-payload `data`
// (e.g. CANCELLATION_POLICY_LATE + hours_until_shift) actually reaches the
// client; `friendlySequelizeMapper` reshapes notNull / unique errors into
// "Field 'x' is required" instead of the raw Sequelize text.
app.use(
  getErrorHandler(env, [apiDataMapper, friendlySequelizeMapper] as never[]),
);

export default app;
