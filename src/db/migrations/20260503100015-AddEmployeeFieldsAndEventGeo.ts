import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    // events: geo coords
    await queryInterface.addColumn(
      'events',
      'latitude',
      { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'events',
      'longitude',
      { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      { transaction },
    );

    // employee_profiles: registration + matching fields
    await queryInterface.addColumn(
      'employee_profiles',
      'date_of_birth',
      { type: Sequelize.DATEONLY, allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'employee_profiles',
      'work_status',
      {
        type: Sequelize.ENUM('freelancer', 'self_employed'),
        allowNull: true,
      },
      { transaction },
    );
    await queryInterface.addColumn(
      'employee_profiles',
      'avatar_url',
      { type: Sequelize.STRING(2048), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'employee_profiles',
      'location_range_km',
      { type: Sequelize.INTEGER, allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'employee_profiles',
      'base_hourly_rate',
      { type: Sequelize.DECIMAL(8, 2), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'employee_profiles',
      'home_latitude',
      { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'employee_profiles',
      'home_longitude',
      { type: Sequelize.DECIMAL(9, 6), allowNull: true },
      { transaction },
    );

    // event_interests: tracks Interested / Not Interested per (user, event)
    await queryInterface.createTable(
      'event_interests',
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
        event_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'events', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        status: {
          type: Sequelize.ENUM('interested', 'not_interested'),
          allowNull: false,
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );

    await queryInterface.addIndex('event_interests', ['user_id', 'event_id'], {
      unique: true,
      transaction,
    });
    await queryInterface.addIndex('event_interests', ['event_id'], { transaction });

    // event_applications: actual hours reporting
    await queryInterface.addColumn(
      'event_applications',
      'reported_hours',
      { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'event_applications',
      'reported_at',
      { type: Sequelize.DATE, allowNull: true },
      { transaction },
    );
    await queryInterface.addColumn(
      'event_applications',
      'hours_status',
      {
        type: Sequelize.ENUM('not_reported', 'pending_approval', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'not_reported',
      },
      { transaction },
    );
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.removeColumn('event_applications', 'hours_status', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_event_applications_hours_status"', { transaction });
    await queryInterface.removeColumn('event_applications', 'reported_at', { transaction });
    await queryInterface.removeColumn('event_applications', 'reported_hours', { transaction });

    await queryInterface.dropTable('event_interests', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_event_interests_status"', { transaction });

    await queryInterface.removeColumn('employee_profiles', 'home_longitude', { transaction });
    await queryInterface.removeColumn('employee_profiles', 'home_latitude', { transaction });
    await queryInterface.removeColumn('employee_profiles', 'base_hourly_rate', { transaction });
    await queryInterface.removeColumn('employee_profiles', 'location_range_km', { transaction });
    await queryInterface.removeColumn('employee_profiles', 'avatar_url', { transaction });
    await queryInterface.removeColumn('employee_profiles', 'work_status', { transaction });
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_employee_profiles_work_status"', { transaction });
    await queryInterface.removeColumn('employee_profiles', 'date_of_birth', { transaction });

    await queryInterface.removeColumn('events', 'longitude', { transaction });
    await queryInterface.removeColumn('events', 'latitude', { transaction });
  },
);
