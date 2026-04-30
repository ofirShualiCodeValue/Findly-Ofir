import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.addColumn(
      'event_applications',
      'proposed_amount',
      { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      { transaction },
    );
    await queryInterface.addIndex('event_applications', ['proposed_amount'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.removeIndex('event_applications', ['proposed_amount'], { transaction });
    await queryInterface.removeColumn('event_applications', 'proposed_amount', { transaction });
  },
);
