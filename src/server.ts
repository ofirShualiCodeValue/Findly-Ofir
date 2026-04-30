import http from 'http';
import config from '../config';
import app from './app';
import { sequelize } from './db/connection';
import { connectCache } from './config/initializers/cache';

const PORT = config.get('port');

(async () => {
  await sequelize.authenticate();
  await connectCache();
  http.createServer(app).listen(PORT);
  console.log(`App listening on port ${PORT}`);
})();
