import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

/**
 * Adds the certification taxonomy + the m:n join to users:
 *
 *   certifications        — master list (תעודת עוסק, אישור ניכוי במקור, …)
 *   user_certifications   — which certifications the worker holds
 *
 * Mirrors the Industry / UserIndustry pattern. A small set of common
 * Israeli credentials is seeded inside the same transaction so the
 * "תעודות" card on the employee profile has data to render immediately
 * after migrate.
 */
export const up = transactionalize(
  async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.createTable(
      'certifications',
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
    await queryInterface.addIndex('certifications', ['slug'], { unique: true, transaction });
    await queryInterface.addIndex('certifications', ['active'], { transaction });

    await queryInterface.createTable(
      'user_certifications',
      {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        certification_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'certifications', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      },
      { transaction },
    );
    await queryInterface.addIndex('user_certifications', ['user_id', 'certification_id'], {
      unique: true,
      transaction,
    });

    // Seed common Israeli credentials. Bundled into the migration (rather
    // than a separate seeder file) so the `certifications` table is never
    // empty after running migrations — the UI can render the multi-select
    // immediately. Idempotent guards aren't needed here because the table
    // was just created in this transaction.
    const now = new Date();
    const seeds = [
      { name: 'תעודת עוסק', slug: 'business-license', display_order: 1 },
      { name: 'אישור ניכוי במקור', slug: 'tax-withholding', display_order: 2 },
      { name: 'אישור ניהול ספרים', slug: 'bookkeeping-approval', display_order: 3 },
      { name: 'תעודת בטיחות בעבודה', slug: 'safety-certificate', display_order: 4 },
      { name: 'רישיון נהיגה', slug: 'driver-license', display_order: 5 },
      { name: 'אישור משטרה (ספר חיובי)', slug: 'police-clearance', display_order: 6 },
      { name: 'תעודת עזרה ראשונה', slug: 'first-aid-certificate', display_order: 7 },
      { name: 'תעודת מאבטח', slug: 'security-license', display_order: 8 },
    ];
    await queryInterface.bulkInsert(
      'certifications',
      seeds.map((s) => ({
        ...s,
        active: true,
        created_at: now,
        updated_at: now,
      })),
      { transaction },
    );
  },
);

export const down = transactionalize(
  async (queryInterface: QueryInterface, _Sequelize: typeof DataTypes, transaction: Transaction) => {
    await queryInterface.dropTable('user_certifications', { transaction });
    await queryInterface.dropTable('certifications', { transaction });
  },
);
