/**
 * Migration Script: Populate phoneNumber field for existing conversations
 * 
 * This script:
 * 1. Adds the phoneNumber column if it doesn't exist
 * 2. Extracts phone numbers from remoteJid for existing @s.whatsapp.net conversations
 * 3. Leaves @lid conversations with null phoneNumber (will be populated on next message)
 * 
 * Run: node migrate_phone_numbers.js
 */

import sequelize from './config/database.js';
import Conversation from './models/Conversation.js';
import { QueryTypes } from 'sequelize';

async function migrate() {
    try {
        console.log('🔄 Starting phone number migration...\n');

        // 1. Ensure the column exists (sequelize.sync should handle this via alter)
        await sequelize.sync({ alter: true });
        console.log('✅ Database schema synced (phoneNumber column ensured)\n');

        // 2. Get all conversations
        const conversations = await Conversation.findAll();
        console.log(`📊 Found ${conversations.length} total conversations\n`);

        let updated = 0;
        let alreadyHasPhone = 0;
        let lidConversations = 0;

        for (const conv of conversations) {
            // Skip if already has a phone number
            if (conv.phoneNumber) {
                alreadyHasPhone++;
                continue;
            }

            const jid = conv.remoteJid;

            if (jid && jid.endsWith('@s.whatsapp.net')) {
                // Extract phone number from @s.whatsapp.net format
                const phone = jid.split('@')[0];
                conv.phoneNumber = phone;
                await conv.save();
                updated++;
                console.log(`  ✅ ${conv.customerName || 'Unknown'} → ${phone}`);
            } else if (jid && jid.endsWith('@lid')) {
                lidConversations++;
                console.log(`  ⚠️  ${conv.customerName || 'Unknown'} → @lid (will update on next message)`);
            }
        }

        console.log('\n' + '─'.repeat(50));
        console.log(`📊 Migration Results:`);
        console.log(`   ✅ Updated: ${updated} conversations`);
        console.log(`   ℹ️  Already had phone: ${alreadyHasPhone}`);
        console.log(`   ⚠️  @lid (pending): ${lidConversations}`);
        console.log(`   📊 Total: ${conversations.length}`);
        console.log('─'.repeat(50));
        console.log('\n✅ Migration complete!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
