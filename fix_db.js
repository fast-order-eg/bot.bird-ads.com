import sequelize from './config/database.js';
import { QueryTypes } from 'sequelize';

const queryInterface = sequelize.getQueryInterface();

async function fixDatabase() {
    try {
        console.log("🛠️  Fixing Foreign Keys...");

        const query = `
            SELECT TABLE_NAME, CONSTRAINT_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE REFERENCED_TABLE_NAME = 'users' AND TABLE_SCHEMA = '${process.env.DB_NAME}';
        `;

        const constraints = await sequelize.query(query, { type: QueryTypes.SELECT });

        for (const constraint of constraints) {
            console.log(`🔌 Dropping constraint ${constraint.CONSTRAINT_NAME} on ${constraint.TABLE_NAME}...`);
            await queryInterface.removeConstraint(constraint.TABLE_NAME, constraint.CONSTRAINT_NAME);
        }

        console.log("🔗 Adding new constraints referencing 'Users'...");

        // Add constraints back for instructions
        try {
            await queryInterface.addConstraint('instructions', {
                fields: ['UserId'],
                type: 'foreign key',
                name: 'instructions_UserId_fk_custom',
                references: {
                    table: 'Users',
                    field: 'id'
                },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
            console.log("✅ Added FK constraint for instructions -> Users");
        } catch (e) {
            console.log("ℹ️ Constraint for instructions might exist or error: " + e.message);
        }

        // Add constraints back for messages
        try {
            await queryInterface.addConstraint('messages', {
                fields: ['UserId'],
                type: 'foreign key',
                name: 'messages_UserId_fk_custom',
                references: {
                    table: 'Users',
                    field: 'id'
                },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
            console.log("✅ Added FK constraint for messages -> Users");
        } catch (e) {
            console.log("ℹ️ Constraint for messages might exist or error: " + e.message);
        }

        // Drop 'users' table
        try {
            console.log("🗑️  Dropping table 'users'...");
            await queryInterface.dropTable('users');
            console.log("✅ Dropped table 'users'");
        } catch (e) {
            console.log("❌ Failed to drop 'users': " + e.message);
        }

    } catch (error) {
        console.error("❌ Fix Failed:", error);
    } finally {
        process.exit();
    }
}

fixDatabase();
