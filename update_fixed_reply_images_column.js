import sequelize from './config/database.js';

async function runMigration() {
    try {
        console.log('🔄 checking messenger_pages table structure...');
        const [results] = await sequelize.query("SHOW COLUMNS FROM messenger_pages LIKE 'fixedReplyImages'");

        if (results.length === 0) {
            console.log('➕ Column fixedReplyImages missing. Adding it now...');
            await sequelize.query("ALTER TABLE messenger_pages ADD COLUMN fixedReplyImages TEXT DEFAULT NULL");
            console.log('✅ Column fixedReplyImages added successfully.');
        } else {
            console.log('✅ Column fixedReplyImages already exists.');
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await sequelize.close();
    }
}

runMigration();
