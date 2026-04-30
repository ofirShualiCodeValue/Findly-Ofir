import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'event_applications',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        event_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'events', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        status: {
          type: Sequelize.ENUM,
          values: [
            'pending',
            'approved',
            'rejected',
            'cancelled_by_employee',
            'cancelled_by_employer',
          ],
          allowNull: false,
          defaultValue: 'pending',
        },
        decided_at: { type: Sequelize.DATE, allowNull: true },
        decided_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        note: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );

    await queryInterface.addIndex('event_applications', ['event_id', 'user_id'], {
      unique: true,
      transaction,
    });
    await queryInterface.addIndex('event_applications', ['user_id'], { transaction });
    await queryInterface.addIndex('event_applications', ['status'], { transaction });
    await queryInterface.addIndex('event_applications', ['event_id', 'status'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('event_applications', { transaction });
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS enum_event_applications_status',
      { transaction },
    );
  },
);
