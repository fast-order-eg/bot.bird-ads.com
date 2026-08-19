import { Sequelize, DataTypes } from 'sequelize';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, 'database.sqlite'),
    logging: false
});

// Define Instruction Model (Simplified)
const Instruction = sequelize.define('Instruction', {
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    UserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'UserId' // Explicitly map to the column 'UserId' (case sensitive in some DBs)
    }
}, {
    tableName: 'Instructions' // Ensure we target the correct table name
});

async function checkInstructions() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        // Fetch ACTIVE instructions for User ID 2
        const instructions = await Instruction.findAll({
            where: {
                UserId: 2,
                isActive: true
            },
            order: [['order', 'ASC']]
        });

        console.log(`\nFound ${instructions.length} active instructions for User ID 2:\n`);

        let totalLength = 0;
        instructions.forEach((inst, index) => {
            console.log(`--- Instruction #${index + 1} (clientsName: ${inst.clientName}) ---`);
            console.log(inst.content);
            console.log(`[Length: ${inst.content.length} characters]\n`);
            totalLength += inst.content.length;
        });

        console.log(`\n--- TOTAL LENGTH: ${totalLength} characters ---`);
        console.log(`--- ESTIMATED TOKENS (Approx): ${Math.ceil(totalLength / 3)} Tokens ---`); // Arabic is ~1 token per 3 chars

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

checkInstructions();
