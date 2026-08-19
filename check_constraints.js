import sequelize from './config/database.js';
import { QueryTypes } from 'sequelize';

async function checkConstraints() {
    try {
        console.log("🔍 Checking Foreign Keys referencing 'users'...");

        const query = `
            SELECT 
                TABLE_NAME, 
                COLUMN_NAME, 
                CONSTRAINT_NAME, 
                REFERENCED_TABLE_NAME, 
                REFERENCED_COLUMN_NAME 
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE REFERENCED_TABLE_NAME = 'users' AND TABLE_SCHEMA = '${process.env.DB_NAME}';
        `;

        const results = await sequelize.query(query, { type: QueryTypes.SELECT });
        console.log(JSON.stringify(results, null, 2));

    } catch (error) {
        console.error("❌ Check Failed:", error);
    } finally {
        process.exit();
    }
}

checkConstraints();
