import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'activity_areas',
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

    await queryInterface.addIndex('activity_areas', ['slug'], { unique: true, transaction });
    await queryInterface.addIndex('activity_areas', ['active'], { transaction });
    await queryInterface.addIndex('activity_areas', ['display_order'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('activity_areas', { transaction });
  },
);
