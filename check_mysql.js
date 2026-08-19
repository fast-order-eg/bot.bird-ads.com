import sequelize from './config/database.js';
import Message from './models/Message.js';
import MessengerConversation from './models/MessengerConversation.js';

async function run() {
    try {
        const msgs = await Message.findAll({
            order: [['createdAt', 'DESC']],
            limit: 5
        });
        console.log("Recent Messages:", msgs.map(m => m.toJSON()));

        const convs = await MessengerConversation.findAll({
            order: [['createdAt', 'DESC']],
            limit: 5
        });
        console.log("Conversations:", convs.map(c => c.toJSON()));
    } catch (e) {
        console.error(e);
    } finally {
        sequelize.close();
    }
}
run();
