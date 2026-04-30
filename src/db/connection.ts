import { Sequelize } from 'sequelize-typescript';
import config from '../../config';

export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: config.get('db.host'),
  port: config.get('db.port'),
  username: config.get('db.user'),
  password: config.get('db.password'),
  database: config.get('db.name'),
  logging: config.get('env') === 'development' ? console.log : false,
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
