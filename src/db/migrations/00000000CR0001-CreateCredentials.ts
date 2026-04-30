import { QueryInterface, DataTypes, Transaction } from 'sequelize';
import { transactionalize } from '@monkeytech/nodejs-core/orm/utils/migrations';

export const up = transactionalize(
	async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
		await queryInterface.createTable('credentials', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            type: {
                type: Sequelize.STRING,
                allowNull: false
            },
            owner_id: Sequelize.INTEGER,
            owner_type: {
                type: Sequelize.STRING,
                allowNull: false
            },
            sid: {
                type: Sequelize.STRING,
                allowNull: false
            },
            secret: {
                type: Sequelize.STRING,
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM,
                values: [
                    'unassigned',
                    'pending',
                    'active',
                    'locked',
                    'suspended'
                ],
                defaultValue: 'unassigned',
                allowNull: false
            },
            status_updated_at: Sequelize.DATE,
            token: Sequelize.STRING,
            token_expires_at: Sequelize.DATE,
            failed_attempts: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            expires_at: Sequelize.DATE,
            login_attempted_at: Sequelize.DATE,
            last_sign_in_at: Sequelize.DATE,
            current_sign_in_at: Sequelize.DATE,
            support_mode_on: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false
            }
        }, { transaction });

        await queryInterface.addIndex('credentials', ['type'], { transaction });

        await queryInterface.addIndex('credentials', ['owner_id'], { transaction });
        await queryInterface.addIndex('credentials', ['owner_type'], { transaction });
        await queryInterface.addIndex('credentials', ['owner_id', 'owner_type'], { transaction });

        await queryInterface.addIndex('credentials', ['sid'], { transaction });

        await queryInterface.addIndex('credentials', ['type', 'owner_type', 'sid'], { unique: true, transaction });

        await queryInterface.addIndex('credentials', ['status'], { transaction });
        await queryInterface.addIndex('credentials', ['status_updated_at'], { transaction });

        await queryInterface.addIndex('credentials', ['expires_at'], { transaction });
        await queryInterface.addIndex('credentials', ['login_attempted_at'], { transaction });
        await queryInterface.addIndex('credentials', ['last_sign_in_at'], { transaction });
        await queryInterface.addIndex('credentials', ['current_sign_in_at'], { transaction });

        await queryInterface.addIndex('credentials', ['token'], { transaction });
        
        await queryInterface.addIndex('credentials', ['created_at'] , { transaction });
        await queryInterface.addIndex('credentials', ['updated_at'], { transaction });
	}
);

export const down = transactionalize(
	async (queryInterface: QueryInterface, Sequelize: typeof DataTypes, transaction: Transaction) => {
		await queryInterface.dropTable('credentials', { transaction });
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_credentials_status', { transaction });
	}
);