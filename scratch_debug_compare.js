import sequelize from './config/database.js';

async function check() {
    try {
        const [rows] = await sequelize.query(`
            SELECT pageId, pageName, isSystemUser, accessToken 
            FROM messenger_pages 
            WHERE pageId IN ('1192684813936904', '1149666461565687')
        `);

        for (const row of rows) {
            console.log(`=== ${row.pageName} (${row.pageId}) isSystemUser: ${row.isSystemUser} ===`);
            const appId = '467899122293591';
            const appSecret = '5ab69626eb8d7a7dc7de5a2fdcc6d010';
            const debugRes = await fetch(`https://graph.facebook.com/v18.0/debug_token?input_token=${row.accessToken}&access_token=${appId}|${appSecret}`);
            const debugData = await debugRes.json();
            console.log('Scopes:', debugData.data?.scopes);
            console.log('Type:', debugData.data?.type);
            console.log('User ID:', debugData.data?.user_id);
            console.log('Profile ID:', debugData.data?.profile_id);
        }
    } catch (e) {
        console.error(e);
    }
    process.exit();
}
check();
