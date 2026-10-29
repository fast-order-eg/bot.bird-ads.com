import sequelize from './config/database.js';

async function check() {
    try {
        const [rows] = await sequelize.query(`
            SELECT pageId, pageName, isSystemUser, LEFT(accessToken, 30) as tokenPrefix, LENGTH(accessToken) as len 
            FROM messenger_pages 
            WHERE pageId IN ('1192684813936904', '1149666461565687', '433101683226918')
        `);
        console.log('Result:', JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit();
}
check();
