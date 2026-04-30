import path from 'path';
import express, { Express, Request, Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { getErrorHandler } from '@monkeytech/nodejs-core/network/errors/middleware';

import config from '../config';
import corsOptions from './config/cors';
import api from './app/api/main';
import { swaggerSpec } from './app/api/v1/common/swagger';

const app: Express = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (config.env !== 'test') {
  app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 timestamp: { type: string, format: date-time }
 *                 env: { type: string }
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: config.env,
  });
});

app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/docs.json', (_req: Request, res: Response) => {
  res.json(swaggerSpec);
});
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Findly API Docs',
    swaggerOptions: { persistAuthorization: true },
  }),
);

app.use('/v1', api);

app.use(getErrorHandler(config.env));

export default app;
