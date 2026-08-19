import sequelize from './config/database.js';

async function migrate() {
    try {
        await sequelize.query('ALTER TABLE messenger_pages ADD COLUMN instagramUsername VARCHAR(255) DEFAULT NULL;');
        console.log("Migration successful.");
    } catch (err) {
        console.error("Migration failed:", err.message);
    }
    process.exit();
}
migrate();
