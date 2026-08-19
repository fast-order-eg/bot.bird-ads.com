import { Sequelize } from 'sequelize';
import MessengerPage from './models/MessengerPage.js';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

async function run() {
    const page = await MessengerPage.findOne({ where: { pageId: '474817845710556', isActive: true } });
    if (!page) return console.log('No active page');
    
    const senderId = '9175681575818779'; // The user ID from logs
    
    const imagePath = path.join(process.cwd(), 'public', '/uploads/instructions/instruction_1781196252204_zn99uy.jpg');
    if (!fs.existsSync(imagePath)) return console.log('File does not exist');
    
    console.log('Sending local image to', senderId);
    try {
        const form = new FormData();
        form.append('recipient', JSON.stringify({ id: senderId }));
        form.append('message', JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: true } } }));
        form.append('filedata', fs.createReadStream(imagePath));

        const res = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${page.accessToken}`, {
            method: 'POST',
            body: form
        });
        const data = await res.json();
        console.log('Response:', data);
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}
run();
