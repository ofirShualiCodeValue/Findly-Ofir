import { sequelize } from '../../db/connection';

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
}

export async function disconnectDatabase(): Promise<void> {
  await sequelize.close();
}

export { sequelize };
