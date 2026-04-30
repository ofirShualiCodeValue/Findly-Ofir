import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'employee_profiles',
      {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        id_number: {
          type: Sequelize.STRING(9),
          allowNull: true,
        },
        bank_account_number: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        bank_branch: {
          type: Sequelize.STRING(10),
          allowNull: true,
        },
        bank_name: {
          type: Sequelize.STRING(50),
          allowNull: true,
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

    await queryInterface.addIndex('employee_profiles', ['user_id'], { unique: true, transaction });
    await queryInterface.addIndex('employee_profiles', ['id_number'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('employee_profiles', { transaction });
  },
);
