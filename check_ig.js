import sequelize from './config/database.js';
import MessengerPage from './models/MessengerPage.js';

async function checkIG() {
    try {
        const pages = await MessengerPage.findAll();
        pages.forEach(p => {
            console.log(`Page: ${p.pageName} | FB ID: ${p.pageId} | IG ID: ${p.instagramId}`);
        });
    } catch (err) {
        console.error("Error:", err.message);
    }
    process.exit();
}

checkIG();
