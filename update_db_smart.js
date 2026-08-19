import sequelize from './config/database.js';
import { Sequelize } from 'sequelize';

const queryInterface = sequelize.getQueryInterface();

async function runMigration() {
    try {
        console.log("⏳ Starting DB Migration...");
        await queryInterface.addColumn('instructions', 'keywords', { type: Sequelize.TEXT, allowNull: true });
        await queryInterface.addColumn('instructions', 'type', { type: Sequelize.STRING, defaultValue: 'topic' });
        console.log("✅ DB Updated Successfully: columns 'keywords' and 'type' added.");
    } catch (error) {
        if (error.message.includes("Duplicate column name")) {
            console.log("⚠️ Columns already exist, skipping migration.");
        } else {
            console.error("❌ Migration Failed:", error);
        }
    } finally {
        process.exit();
    }
}

runMigration();
