import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'event_categories',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        slug: { type: Sequelize.STRING(50), allowNull: false },
        display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );

    await queryInterface.addIndex('event_categories', ['slug'], { unique: true, transaction });
    await queryInterface.addIndex('event_categories', ['active'], { transaction });
    await queryInterface.addIndex('event_categories', ['display_order'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('event_categories', { transaction });
  },
);
