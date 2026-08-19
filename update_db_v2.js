import sequelize from './config/database.js';
import Instruction from './models/Instruction.js';

async function updateDatabase() {
    try {
        console.log("🔄 Starting Database Update V2...");

        // Force sync specific model to add new columns if they don't exist
        // Note: verify if alter works with your specific DB dialect (MySQL/SQLite)
        // For safety, we can run raw queries if alter fails, but let's try alter first.

        await Instruction.sync({ alter: true });
        console.log("✅ Instruction Table Updated (Altered).");

        console.log("🚀 Database V2 Migration Completed!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Database Update Failed:", error);
        process.exit(1);
    }
}

updateDatabase();
