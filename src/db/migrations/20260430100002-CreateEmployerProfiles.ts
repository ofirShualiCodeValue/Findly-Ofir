import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'employer_profiles',
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
        business_name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        owner_name: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        vat_number: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        contact_email: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        contact_phone: {
          type: Sequelize.STRING(20),
          allowNull: true,
        },
        address: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        logo_url: {
          type: Sequelize.STRING(2048),
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

    await queryInterface.addIndex('employer_profiles', ['user_id'], { unique: true, transaction });
    await queryInterface.addIndex('employer_profiles', ['vat_number'], { transaction });
    await queryInterface.addIndex('employer_profiles', ['business_name'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('employer_profiles', { transaction });
  },
);
