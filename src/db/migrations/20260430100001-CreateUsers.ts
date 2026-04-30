import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'users',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        full_name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        phone: {
          type: Sequelize.STRING(20),
          allowNull: false,
        },
        email: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        role: {
          type: Sequelize.ENUM,
          values: ['employer', 'employee'],
          allowNull: false,
        },
        status: {
          type: Sequelize.ENUM,
          values: ['active', 'inactive', 'suspended'],
          allowNull: false,
          defaultValue: 'active',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
      { transaction },
    );

    await queryInterface.addIndex('users', ['phone'], { unique: true, transaction });
    await queryInterface.addIndex('users', ['email'], { transaction });
    await queryInterface.addIndex('users', ['role'], { transaction });
    await queryInterface.addIndex('users', ['status'], { transaction });
    await queryInterface.addIndex('users', ['created_at'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('users', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_users_role', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_users_status', { transaction });
  },
);
