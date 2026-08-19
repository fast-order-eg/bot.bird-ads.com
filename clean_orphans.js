import sequelize from './config/database.js';
import { QueryTypes } from 'sequelize';

const queryInterface = sequelize.getQueryInterface();

async function cleanOrphans() {
    try {
        console.log("🧹 Cleaning orphaned records...");

        // 1. Delete messages with invalid UserId
        await sequelize.query(`
            DELETE FROM messages 
            WHERE UserId NOT IN (SELECT id FROM Users)
        `, { type: QueryTypes.DELETE });
        console.log("✅ Cleaned orphaned messages");

        // 2. Delete instructions with invalid UserId
        await sequelize.query(`
            DELETE FROM instructions 
            WHERE UserId NOT IN (SELECT id FROM Users)
        `, { type: QueryTypes.DELETE });
        console.log("✅ Cleaned orphaned instructions");

        console.log("🔗 Re-attempting to add constraints...");

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
            console.log("ℹ️ Constraint for instructions error: " + e.message);
        }

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
            console.log("ℹ️ Constraint for messages error: " + e.message);
        }

    } catch (error) {
        console.error("❌ Cleanup Failed:", error);
    } finally {
        process.exit();
    }
}

cleanOrphans();
