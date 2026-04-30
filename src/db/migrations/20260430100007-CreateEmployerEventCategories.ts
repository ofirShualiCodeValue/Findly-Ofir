import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'employer_event_categories',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        event_category_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'event_categories', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );

    await queryInterface.addIndex(
      'employer_event_categories',
      ['user_id', 'event_category_id'],
      { unique: true, transaction },
    );
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('employer_event_categories', { transaction });
  },
);
