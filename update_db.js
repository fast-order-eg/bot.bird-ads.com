
import sequelize from './config/database.js';

async function updateDB() {
    try {
        console.log('🔄 Checking database schema...');

        const [results] = await sequelize.query("SHOW COLUMNS FROM Users LIKE 'connection_status'");

        if (results.length === 0) {
            console.log('➕ Column connection_status missing. Adding it now...');
            await sequelize.query("ALTER TABLE Users ADD COLUMN connection_status VARCHAR(255) DEFAULT 'offline'");
            console.log('✅ Column connection_status added successfully.');
        } else {
            console.log('✅ Column connection_status already exists.');
        }

        // Check for expiry_date
        const [expiryResults] = await sequelize.query("SHOW COLUMNS FROM Users LIKE 'expiry_date'");
        if (expiryResults.length === 0) {
            console.log('➕ Column expiry_date missing. Adding it now...');
            await sequelize.query("ALTER TABLE Users ADD COLUMN expiry_date DATE DEFAULT NULL");
            console.log('✅ Column expiry_date added successfully.');
        } else {
            console.log('✅ Column expiry_date already exists.');
        }

        // Check for total_tokens
        const [tokenResults] = await sequelize.query("SHOW COLUMNS FROM Users LIKE 'total_tokens'");
        if (tokenResults.length === 0) {
            console.log('➕ Column total_tokens missing. Adding it now...');
            await sequelize.query("ALTER TABLE Users ADD COLUMN total_tokens INT DEFAULT 0");
            console.log('✅ Column total_tokens added successfully.');
        } else {
            console.log('✅ Column total_tokens already exists.');
        }

    } catch (error) {
        console.error('❌ Database update error:', error);
    } finally {
        await sequelize.close();
    }
}

updateDB();
