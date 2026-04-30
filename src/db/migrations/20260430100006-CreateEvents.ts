import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'events',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        created_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        event_category_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'event_categories', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        activity_area_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'activity_areas', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        name: { type: Sequelize.STRING, allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        venue: { type: Sequelize.STRING, allowNull: true },
        start_at: { type: Sequelize.DATE, allowNull: false },
        end_at: { type: Sequelize.DATE, allowNull: false },
        budget: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        required_employees: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        status: {
          type: Sequelize.ENUM,
          values: ['draft', 'active', 'cancelled', 'completed'],
          allowNull: false,
          defaultValue: 'draft',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );

    await queryInterface.addIndex('events', ['created_by_user_id'], { transaction });
    await queryInterface.addIndex('events', ['event_category_id'], { transaction });
    await queryInterface.addIndex('events', ['activity_area_id'], { transaction });
    await queryInterface.addIndex('events', ['start_at'], { transaction });
    await queryInterface.addIndex('events', ['status'], { transaction });
    await queryInterface.addIndex('events', ['status', 'start_at'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('events', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_events_status', { transaction });
  },
);
