import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
	async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
		await queryInterface.createTable('tokens', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            key: {
                type: Sequelize.UUID,
                allowNull: false,
                defaultValue: Sequelize.UUIDV4
            },
            parent_id: Sequelize.UUID,
            status: {
                type: Sequelize.ENUM,
                values: [
                    'active',
                    'blocked'
                ],
                defaultValue: 'active',
                allowNull: false
            },
            status_updated_at: Sequelize.DATE,
            expires_at: Sequelize.DATE,
            created_at: {
                type: Sequelize.DATE,
                allowNull: false
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false
            }
        }, { transaction });

        await queryInterface.addIndex('tokens', ['key'], { unique: true, transaction });

        await queryInterface.addIndex('tokens', ['parent_id'], { transaction });

        await queryInterface.addIndex('tokens', ['status'], { transaction });

        await queryInterface.addIndex('tokens', ['expires_at'], { transaction });

        await queryInterface.addIndex('tokens', ['created_at'] , { transaction });
        await queryInterface.addIndex('tokens', ['updated_at'], { transaction });
	}
);

export const down = transactionalize(
	async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
		await queryInterface.dropTable('tokens', { transaction });
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_tokens_status', { transaction });
	}
);