import { CorsOptions } from 'cors';
import config from '../../config';

const allowedOrigins: string[] = config
  .get('cors.origins')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Flutter web's debug server picks an ephemeral port (e.g. 5173, 51234, ...).
// In development we relax the strict allowlist and accept any localhost origin
// so the dev experience doesn't break every time the port changes.
const localhostRegex = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    if (config.get('env') !== 'production' && localhostRegex.test(origin)) {
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
