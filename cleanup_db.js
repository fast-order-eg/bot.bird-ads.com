import sequelize from './config/database.js';
import { Sequelize } from 'sequelize';

const queryInterface = sequelize.getQueryInterface();

async function runCleanup() {
    try {
        console.log("⏳ Starting Database Cleanup & Sync...");

        // 1. Add missing columns to Users
        const columnsToAdd = [
            { name: 'pause_until', type: Sequelize.DATE, comment: 'Full timestamp for pause timer' },
            { name: 'control_group_jid', type: Sequelize.STRING, comment: 'Store JID of the control group' }
        ];

        for (const col of columnsToAdd) {
            try {
                await queryInterface.addColumn('Users', col.name, {
                    type: col.type,
                    allowNull: true,
                    comment: col.comment
                });
                console.log(`✅ Added column '${col.name}' to Users`);
            } catch (e) {
                console.log(`ℹ️ Column '${col.name}' likely exists or error: ${e.message}`);
            }
        }

        // 2. Drop redundant 'users' table
        try {
            await queryInterface.dropTable('users');
            console.log("🗑️  Dropped redundant table 'users'");
        } catch (e) {
            console.log(`ℹ️ Could not drop 'users' (maybe doesn't exist): ${e.message}`);
        }

        console.log("🎉 Cleanup Complete");

    } catch (error) {
        console.error("❌ Cleanup Failed:", error);
    } finally {
        process.exit();
    }
}

runCleanup();
