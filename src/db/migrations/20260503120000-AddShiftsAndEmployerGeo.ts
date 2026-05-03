import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

/**
 * Phase 1 of the Employer App buildout:
 *  - Geocoding for the business address (lat/lng on employer_profiles).
 *  - The Shift concept: a single Event ("container") can now own many shifts,
 *    each with its own time window, on-site contact, and staffing breakdown.
 *  - Staffing per shift: multiple sub-categories (florist, setup worker, …)
 *    each with a required count, so a shift can mix roles.
 *  - Existing event_applications stay valid; a new nullable shift_id lets
 *    workers apply to a specific shift when the event uses them.
 */
export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    // ---- Employer profile geo ----
    await queryInterface.addColumn(
      'employer_profiles',
      'latitude',
      { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'employer_profiles',
      'longitude',
      { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      { transaction },
    );

    // ---- Shifts ----
    await queryInterface.createTable(
      'shifts',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        event_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'events', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        start_at: { type: Sequelize.DATE, allowNull: false },
        end_at: { type: Sequelize.DATE, allowNull: false },
        contact_person_name: { type: Sequelize.STRING, allowNull: true },
        contact_person_phone: { type: Sequelize.STRING(20), allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        status: {
          type: Sequelize.ENUM('active', 'cancelled', 'completed'),
          allowNull: false,
          defaultValue: 'active',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );
    await queryInterface.addIndex('shifts', ['event_id'], { transaction });
    await queryInterface.addIndex('shifts', ['status'], { transaction });
    await queryInterface.addIndex('shifts', ['start_at'], { transaction });

    // ---- Staffing requirements ----
    // Multiple rows per shift — one per sub-category. UNIQUE(shift, sub-cat)
    // means "florist x 2" is a single row with required_count=2, not two rows.
    await queryInterface.createTable(
      'shift_staffing_requirements',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        shift_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'shifts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        industry_subcategory_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'industry_subcategories', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        required_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );
    await queryInterface.addIndex(
      'shift_staffing_requirements',
      ['shift_id', 'industry_subcategory_id'],
      { unique: true, transaction },
    );

    // ---- Application → Shift link ----
    await queryInterface.addColumn(
      'event_applications',
      'shift_id',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      { transaction },
    );
    await queryInterface.addIndex('event_applications', ['shift_id'], { transaction });
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.removeColumn('event_applications', 'shift_id', { transaction });
    await queryInterface.dropTable('shift_staffing_requirements', { transaction });
    await queryInterface.dropTable('shifts', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_shifts_status"', { transaction });
    await queryInterface.removeColumn('employer_profiles', 'longitude', { transaction });
    await queryInterface.removeColumn('employer_profiles', 'latitude', { transaction });
  },
);
