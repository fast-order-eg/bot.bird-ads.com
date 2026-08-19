import { Sequelize } from 'sequelize';
import MessageModel from './models/Message.js';
import MessengerPageModel from './models/MessengerPage.js';
import MessengerConversationModel from './models/MessengerConversation.js';

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false
});

// Since the models need the instance, let's just use raw query but list tables first
async function run() {
    try {
        const [tables] = await sequelize.query("SELECT name FROM sqlite_master WHERE type='table';");
        console.log("Tables:", tables);
        
        let messageTable = tables.find(t => t.name.toLowerCase() === 'messages')?.name;
        if (messageTable) {
            const [results] = await sequelize.query(`SELECT id, role, remoteJid, content, createdAt FROM "${messageTable}" ORDER BY createdAt DESC LIMIT 5`);
            console.log("Recent Messages:", results);
        }

        let convTable = tables.find(t => t.name.toLowerCase() === 'messengerconversations')?.name;
        if (convTable) {
            const [conversations] = await sequelize.query(`SELECT * FROM "${convTable}" ORDER BY createdAt DESC LIMIT 5`);
            console.log("Conversations:", conversations);
        }

        let pageTable = tables.find(t => t.name.toLowerCase() === 'messengerpages')?.name;
        if (pageTable) {
            const [pages] = await sequelize.query(`SELECT * FROM "${pageTable}" LIMIT 5`);
            console.log("Pages:", pages);
        }
    } catch (e) {
        console.error(e);
    }
}
run();
