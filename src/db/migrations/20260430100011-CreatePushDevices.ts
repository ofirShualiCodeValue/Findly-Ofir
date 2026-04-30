import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'push_devices',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        platform: {
          type: Sequelize.ENUM,
          values: ['ios', 'android', 'web'],
          allowNull: false,
        },
        token: { type: Sequelize.TEXT, allowNull: false },
        enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        last_seen_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );

    await queryInterface.addIndex('push_devices', ['user_id'], { transaction });
    await queryInterface.addIndex('push_devices', ['token'], { unique: true, transaction });
    await queryInterface.addIndex('push_devices', ['enabled'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('push_devices', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_push_devices_platform', {
      transaction,
    });
  },
);
