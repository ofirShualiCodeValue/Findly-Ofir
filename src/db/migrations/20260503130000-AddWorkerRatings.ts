import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

/**
 * Phase 2: ratings an employer leaves on a worker after a shift.
 * One rating per (worker, application) — re-rating updates the row.
 */
export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'worker_ratings',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        worker_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        rated_by_user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        event_application_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'event_applications', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        rating: { type: Sequelize.INTEGER, allowNull: false },
        comment: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );
    await queryInterface.addIndex('worker_ratings', ['worker_user_id'], { transaction });
    await queryInterface.addIndex('worker_ratings', ['event_application_id'], {
      unique: true,
      transaction,
    });
    // Sequelize doesn't expose CHECK in createTable; do it via raw SQL.
    await queryInterface.sequelize.query(
      `ALTER TABLE worker_ratings ADD CONSTRAINT worker_ratings_rating_range CHECK (rating BETWEEN 1 AND 5)`,
      { transaction },
    );
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('worker_ratings', { transaction });
  },
);
