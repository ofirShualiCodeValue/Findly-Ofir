import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'notifications',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        recipient_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        sender_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        event_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'events', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        type: {
          type: Sequelize.ENUM,
          values: [
            'event_message',
            'application_approved',
            'application_rejected',
            'shift_reminder',
            'shift_ended',
            'employee_cancelled',
            'event_cancelled',
            'system',
          ],
          allowNull: false,
        },
        title: { type: Sequelize.STRING, allowNull: false },
        body: { type: Sequelize.TEXT, allowNull: true },
        meta: { type: Sequelize.JSONB, allowNull: true },
        read_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );

    await queryInterface.addIndex('notifications', ['recipient_user_id'], { transaction });
    await queryInterface.addIndex('notifications', ['recipient_user_id', 'read_at'], { transaction });
    await queryInterface.addIndex('notifications', ['event_id'], { transaction });
    await queryInterface.addIndex('notifications', ['type'], { transaction });
    await queryInterface.addIndex('notifications', ['created_at'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('notifications', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_notifications_type', {
      transaction,
    });
  },
);
