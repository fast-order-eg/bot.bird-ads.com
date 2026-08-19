import sequelize from './config/database.js';

async function checkSchema() {
    try {
        const [results] = await sequelize.query("SHOW COLUMNS FROM Users;");
        console.log(results);
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
checkSchema();
