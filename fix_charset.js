import sequelize from './config/database.js';

async function fixCharset() {
    try {
        console.log("Setting DB Charset to utf8mb4...");
        // Alter Database
        await sequelize.query(`ALTER DATABASE bird_Linawhatsapp CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;`);
        
        // Alter Tables
        const tables = [
            'Users',
            'messages',
            'instructions',
            'SimulationMessages',
            'TeachMessages'
        ];
        
        for (const table of tables) {
            console.log(`Fixing table ${table}...`);
            await sequelize.query(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        }
        
        console.log("Done fixing charsets.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixCharset();
