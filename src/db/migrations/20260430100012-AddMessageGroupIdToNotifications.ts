import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.addColumn(
      'notifications',
      'message_group_id',
      { type: Sequelize.UUID, allowNull: true },
      { transaction },
    );
    await queryInterface.addIndex('notifications', ['message_group_id'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.removeIndex('notifications', ['message_group_id'], { transaction });
    await queryInterface.removeColumn('notifications', 'message_group_id', { transaction });
  },
);
