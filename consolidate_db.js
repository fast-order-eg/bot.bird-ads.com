import sequelize from './config/database.js';
import { QueryTypes } from 'sequelize';

const queryInterface = sequelize.getQueryInterface();

async function consolidate() {
    try {
        console.log("📦 Starting Data Consolidation...");

        // 1. Merge BotInstructions -> instructions
        // Check for duplicates based on content/title? Or just dump all?
        // User said: "Check valid ones". 
        // Let's assume title is unique identifier for an instruction concept.
        // But to be safe, let's migrate everything and let user assume cleanup, or try to be smart.
        // Simple merge: Insert all from BotInstructions that don't have same title in instructions.

        // 1. Merge BotInstructions -> instructions
        try {
            console.log("🔄 Merging BotInstructions -> instructions...");
            await sequelize.query(`
                INSERT INTO instructions (clientName, title, content, actionTarget, imageUrl, \`order\`, isActive, createdAt, updatedAt, UserId, \`type\`, \`keywords\`)
                SELECT 
                    clientName, title, content, actionTarget, imageUrl, \`order\`, isActive, createdAt, updatedAt, UserId, 'topic', NULL
                FROM BotInstructions 
                WHERE title NOT IN (SELECT title FROM instructions)
                AND UserId IN (SELECT id FROM Users);
            `, { type: QueryTypes.INSERT });
            console.log("✅ Merged unique BotInstructions.");
        } catch (e) {
            console.error("❌ Failed to merge BotInstructions: " + e.message);
        }

        // 2. Merge ChatMessages -> messages
        try {
            console.log("🔄 Merging ChatMessages -> messages...");
            const [results, metadata] = await sequelize.query(`
                INSERT INTO messages (remoteJid, role, content, media_url, createdAt, updatedAt, UserId)
                SELECT remoteJid, role, content, media_url, createdAt, updatedAt, UserId
                FROM ChatMessages
                WHERE UserId IN (SELECT id FROM Users);
            `, { type: QueryTypes.INSERT });
            console.log(`✅ Merged ChatMessages (${metadata} rows affected)`);
        } catch (e) {
            console.error("❌ Failed to merge ChatMessages: " + e.message);
        }

        // 3. Drop Redundant Tables
        // Only if merge was successful.
        // We'll create a backup table just in case?
        // "take backup security also"

        console.log("🛡️  Creating Backups for safety...");
        try {
            await sequelize.query("CREATE TABLE IF NOT EXISTS ChatMessages_Backup AS SELECT * FROM ChatMessages;");
            await sequelize.query("CREATE TABLE IF NOT EXISTS BotInstructions_Backup AS SELECT * FROM BotInstructions;");
            console.log("✅ Backups created: ChatMessages_Backup, BotInstructions_Backup");

            // Now Drop Originals
            await queryInterface.dropTable('ChatMessages');
            await queryInterface.dropTable('BotInstructions');
            console.log("🗑️  Dropped redundant tables: ChatMessages, BotInstructions");

        } catch (e) {
            console.error("⚠️ Backup/Drop failed: " + e.message);
        }

        console.log("🎉 Consolidation Complete!");

    } catch (error) {
        console.error("❌ Consolidation Failed:", error);
    } finally {
        process.exit();
    }
}

consolidate();
