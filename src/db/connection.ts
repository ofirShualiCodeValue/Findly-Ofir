import { Sequelize } from 'sequelize-typescript';
import config from '../../config';

export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  logging: config.env === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30_000,
    idle: 10_000,
  },
  define: {
    underscored: true,
    timestamps: true,
    paranoid: false,
  },
  models: [__dirname + '/../app/models/**/*.{ts,js}'],
});
