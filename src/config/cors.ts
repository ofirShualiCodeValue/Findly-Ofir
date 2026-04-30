import { CorsOptions } from 'cors';
import config from '../../config';

const allowedOrigins: string[] = config.cors.origins
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: [
    'X-Total',
    'X-Total-Pages',
    'X-Page',
    'X-Per-Page',
    'X-Next-Page',
    'X-Prev-Page',
    'X-Offset',
  ],
};

export default corsOptions;
