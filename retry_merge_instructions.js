import sequelize from './config/database.js';
import { QueryTypes } from 'sequelize';
import Instruction from './models/Instruction.js';

async function retryMerge() {
    try {
        console.log("🔄 Retrying BotInstructions Merge from Backup...");

        // Read from backup
        const oldInstructions = await sequelize.query("SELECT * FROM BotInstructions_Backup", { type: QueryTypes.SELECT });
        console.log(`📖 Found ${oldInstructions.length} instructions in backup.`);

        let count = 0;
        for (const oldInst of oldInstructions) {
            // Check if exists
            const exists = await Instruction.findOne({ where: { title: oldInst.title } });
            if (!exists) {
                // Insert using Model to handle collation/encoding
                // Also need to check if UserId is valid, defaulting to NULL if not found isn't great but foreign key prevents invalid.
                // We'll try to insert.
                try {
                    await Instruction.create({
                        clientName: oldInst.clientName,
                        title: oldInst.title,
                        content: oldInst.content,
                        actionTarget: oldInst.actionTarget,
                        imageUrl: oldInst.imageUrl,
                        order: oldInst.order,
                        isActive: oldInst.isActive,
                        UserId: oldInst.UserId, // If this is invalid, it will fail.
                        type: 'topic', // Default
                        keywords: null
                    });
                    console.log(`✅ Migrated: ${oldInst.title}`);
                    count++;
                } catch (err) {
                    console.log(`⚠️ Failed to migrate '${oldInst.title}': ${err.message}`);
                }
            } else {
                console.log(`ℹ️ Skipped (exists): ${oldInst.title}`);
            }
        }

        console.log(`🎉 Merge Complete. Migrated ${count} instructions.`);

    } catch (error) {
        console.error("❌ Retry Failed:", error);
    } finally {
        process.exit();
    }
}

retryMerge();
