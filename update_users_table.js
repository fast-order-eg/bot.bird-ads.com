import sequelize from './config/database.js';
import { Sequelize } from 'sequelize';

const queryInterface = sequelize.getQueryInterface();

async function runMigration() {
    try {
        console.log("⏳ Starting Users Table Migration...");

        // Add expiry_date
        try {
            await queryInterface.addColumn('Users', 'expiry_date', {
                type: Sequelize.DATEONLY,
                allowNull: true,
                comment: 'Date when the user subscription expires'
            });
            console.log("✅ Added column 'expiry_date'");
        } catch (e) {
            console.log("ℹ️ Column 'expiry_date' likely exists or error: " + e.message);
        }

        // Add total_tokens
        try {
            await queryInterface.addColumn('Users', 'total_tokens', {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                comment: 'Total estimated tokens used by the user'
            });
            console.log("✅ Added column 'total_tokens'");
        } catch (e) {
            console.log("ℹ️ Column 'total_tokens' likely exists or error: " + e.message);
        }

        console.log("🎉 Users Table Migration Complete");

    } catch (error) {
        console.error("❌ Migration Failed:", error);
    } finally {
        process.exit();
    }
}

runMigration();
