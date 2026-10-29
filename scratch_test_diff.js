import sequelize from './config/database.js';

async function test() {
    try {
        const [pages] = await sequelize.query(`
            SELECT pageId, pageName, isSystemUser, accessToken 
            FROM messenger_pages 
            WHERE pageId IN ('1192684813936904', '1149666461565687')
        `);

        for (const p of pages) {
            console.log(`\n=================== Page: ${p.pageName} (${p.pageId}) isSystemUser: ${p.isSystemUser} ===================`);
            
            // Check page info
            const pRes = await fetch(`https://graph.facebook.com/v18.0/${p.pageId}?fields=id,name,is_published,verification_status&access_token=${p.accessToken}`);
            console.log('Page info:', await pRes.json());

            // Check permissions on this page token
            const permRes = await fetch(`https://graph.facebook.com/v18.0/me/permissions?access_token=${p.accessToken}`);
            const permData = await permRes.json();
            console.log('Token permissions count:', permData.data?.length);

            // Check subscribed apps
            const subRes = await fetch(`https://graph.facebook.com/v18.0/${p.pageId}/subscribed_apps?access_token=${p.accessToken}`);
            console.log('Subscribed apps:', await subRes.json());
        }
    } catch (e) {
        console.error(e);
    }
    process.exit();
}
test();
