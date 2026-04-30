import path from 'path';
import express, { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from './v1/common/swagger';
import v1Router from './v1/main';

/**
 * Mounts everything that lives under the API surface:
 * - static asset serving for uploaded files
 * - Swagger UI + raw OpenAPI spec
 * - the versioned API router
 */
export default function mountApi(app: Express): void {
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

  app.use('/v1', v1Router);
}
