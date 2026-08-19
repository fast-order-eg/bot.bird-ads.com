import sequelize from './config/database.js';

const queryInterface = sequelize.getQueryInterface();

async function finalCleanup() {
    try {
        console.log("🧹 Final Database Cleanup...");

        // Drop empty Messages table
        try {
            await queryInterface.dropTable('Messages');
            console.log("✅ Dropped empty 'Messages' table");
        } catch (e) {
            console.log("ℹ️ Could not drop 'Messages': " + e.message);
        }

        console.log("🎉 Cleanup Complete!");

    } catch (error) {
        console.error("❌ Cleanup Failed:", error);
    } finally {
        process.exit();
    }
}

finalCleanup();
