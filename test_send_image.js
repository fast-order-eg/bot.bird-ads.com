import { Sequelize } from 'sequelize';
import MessengerPage from './models/MessengerPage.js';
import fetch from 'node-fetch';

async function run() {
    const page = await MessengerPage.findOne({ where: { pageId: '474817845710556', isActive: true } });
    if (!page) return console.log('No active page');
    
    const senderId = '9175681575818779'; // The user ID from logs
    const fullImgUrl = encodeURI('https://whatsapp.bird-ads.com/uploads/instructions/instruction_1781196252204_zn99uy.jpg');
    
    console.log('Sending image to', senderId);
    try {
        const res = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${page.accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: senderId },
                message: {
                    attachment: { type: "image", payload: { url: fullImgUrl } }
                }
            })
        });
        const data = await res.json();
        console.log('Response:', data);
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}
run();
