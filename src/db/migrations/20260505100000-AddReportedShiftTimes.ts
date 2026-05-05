import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

/**
 * Worker hour reporting moves from a single `reported_hours` number to a
 * concrete time range (`reported_start_at` → `reported_end_at`). The
 * existing `reported_hours` column stays as a derived total — the model
 * computes it from the timestamps on every save — so consumers (Flutter
 * UI, earnings rollup) keep working without changes.
 */
export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.addColumn(
      'event_applications',
      'reported_start_at',
      { type: Sequelize.DATE, allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'event_applications',
      'reported_end_at',
      { type: Sequelize.DATE, allowNull: true },
      { transaction },
    );
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.removeColumn('event_applications', 'reported_end_at', { transaction });
    await queryInterface.removeColumn('event_applications', 'reported_start_at', { transaction });
  },
);
