import sequelize from './config/database.js';

async function migrate() {
    try {
        await sequelize.query('ALTER TABLE messenger_pages ADD COLUMN defaultComment VARCHAR(1000) DEFAULT "أهلاً وسهلاً بحضرتك 😊\nتم إرسال التفاصيل لك في الرسائل الخاصة ✅";');
        console.log("Migration successful.");
    } catch (err) {
        console.error("Migration error:", err.message);
    }
    process.exit();
}

migrate();
