import sequelize from './config/database.js';
import Instruction from './models/Instruction.js';
import { CONFIG } from './config.js';

async function updateInstruction() {
    try {
        await sequelize.authenticate();

        // Update Instruction 9 with the cleaner SYSTEM_INSTRUCTIONS from config
        // This ensures consistency.
        await Instruction.update(
            { content: CONFIG.SYSTEM_INSTRUCTIONS },
            { where: { id: 9 } }
        );

        console.log("Instruction 9 updated to match system config.");
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

updateInstruction();
