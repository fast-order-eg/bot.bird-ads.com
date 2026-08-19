import sequelize from './config/database.js';

async function migrate() {
    try {
        await sequelize.query('ALTER TABLE messenger_pages ADD COLUMN replyToMessagesWithFixed BOOLEAN DEFAULT true;');
        console.log("Migration successful.");
    } catch (err) {
        console.error("Migration error:", err.message);
    }
    process.exit();
}

migrate();
