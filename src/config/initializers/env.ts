import dotenv from 'dotenv';
import path from 'path';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });
