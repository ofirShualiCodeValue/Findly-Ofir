import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

/**
 * Adds the "service industry" axis (separate from event categories).
 *
 *  industries                — service domains (catering, event production, …)
 *  industry_subcategories    — roles within each industry (florist, setup worker, …)
 *  user_industries           — m:n: which industries an employee is in
 *  user_industry_subcategories — m:n: which roles an employee can fill
 *
 * Also folds in the registration-form field upgrades surfaced by the new
 * Figma flow: split first/last name, home_city, and the work_status enum
 * being renamed from {freelancer, self_employed} to {freelancer, salaried}.
 */
export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    // ---- Identity & registration extras ----------------------------------
    await queryInterface.addColumn(
      'users',
      'first_name',
      { type: Sequelize.STRING, allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'users',
      'last_name',
      { type: Sequelize.STRING, allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'employee_profiles',
      'home_city',
      { type: Sequelize.STRING, allowNull: true },
      { transaction },
    );

    // ---- work_status enum: replace 'self_employed' with 'salaried' --------
    // Postgres enum migrations: rename type, add new enum, swap, drop old.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_employee_profiles_work_status" RENAME TO "enum_employee_profiles_work_status_old"`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_employee_profiles_work_status" AS ENUM ('freelancer', 'salaried')`,
      { transaction },
    );
    // Map old value to new (no production data, but be safe).
    await queryInterface.sequelize.query(
      `ALTER TABLE "employee_profiles"
         ALTER COLUMN "work_status" TYPE "enum_employee_profiles_work_status"
         USING (
           CASE "work_status"::text
             WHEN 'self_employed' THEN 'salaried'::"enum_employee_profiles_work_status"
             WHEN 'freelancer' THEN 'freelancer'::"enum_employee_profiles_work_status"
             ELSE NULL
           END
         )`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP TYPE "enum_employee_profiles_work_status_old"`,
      { transaction },
    );

    // ---- Industries -------------------------------------------------------
    await queryInterface.createTable(
      'industries',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        slug: { type: Sequelize.STRING, allowNull: false, unique: true },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );
    await queryInterface.addIndex('industries', ['slug'], { unique: true, transaction });
    await queryInterface.addIndex('industries', ['active'], { transaction });

    await queryInterface.createTable(
      'industry_subcategories',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        industry_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'industries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        name: { type: Sequelize.STRING, allowNull: false },
        slug: { type: Sequelize.STRING, allowNull: false },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );
    await queryInterface.addIndex('industry_subcategories', ['industry_id', 'slug'], {
      unique: true,
      transaction,
    });
    await queryInterface.addIndex('industry_subcategories', ['industry_id'], { transaction });

    // ---- Employee m:n joins -----------------------------------------------
    await queryInterface.createTable(
      'user_industries',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        industry_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'industries', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );
    await queryInterface.addIndex('user_industries', ['user_id', 'industry_id'], {
      unique: true,
      transaction,
    });

    await queryInterface.createTable(
      'user_industry_subcategories',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        industry_subcategory_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'industry_subcategories', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );
    await queryInterface.addIndex(
      'user_industry_subcategories',
      ['user_id', 'industry_subcategory_id'],
      { unique: true, transaction },
    );

    // ---- Events: which role is being hired --------------------------------
    await queryInterface.addColumn(
      'events',
      'industry_subcategory_id',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'industry_subcategories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      { transaction },
    );
    await queryInterface.addIndex('events', ['industry_subcategory_id'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.removeColumn('events', 'industry_subcategory_id', { transaction });
    await queryInterface.dropTable('user_industry_subcategories', { transaction });
    await queryInterface.dropTable('user_industries', { transaction });
    await queryInterface.dropTable('industry_subcategories', { transaction });
    await queryInterface.dropTable('industries', { transaction });

    // Rollback work_status enum to the old values.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_employee_profiles_work_status" RENAME TO "enum_employee_profiles_work_status_new"`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `CREATE TYPE "enum_employee_profiles_work_status" AS ENUM ('freelancer', 'self_employed')`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "employee_profiles"
         ALTER COLUMN "work_status" TYPE "enum_employee_profiles_work_status"
         USING (
           CASE "work_status"::text
             WHEN 'salaried' THEN 'self_employed'::"enum_employee_profiles_work_status"
             WHEN 'freelancer' THEN 'freelancer'::"enum_employee_profiles_work_status"
             ELSE NULL
           END
         )`,
      { transaction },
    );
    await queryInterface.sequelize.query(
      `DROP TYPE "enum_employee_profiles_work_status_new"`,
      { transaction },
    );

    await queryInterface.removeColumn('employee_profiles', 'home_city', { transaction });
    await queryInterface.removeColumn('users', 'last_name', { transaction });
    await queryInterface.removeColumn('users', 'first_name', { transaction });
  },
);
