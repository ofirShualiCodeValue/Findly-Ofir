import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.addColumn(
      'users',
      'notify_email',
      { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'users',
      'notify_sms',
      { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'users',
      'notify_push',
      { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      { transaction },
    );
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.removeColumn('users', 'notify_email', { transaction });
    await queryInterface.removeColumn('users', 'notify_sms', { transaction });
    await queryInterface.removeColumn('users', 'notify_push', { transaction });
  },
);
