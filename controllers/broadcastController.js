import Campaign from '../models/Campaign.js';
import MessengerPage from '../models/MessengerPage.js';
import { sendManualMessage } from './botController.js';
import { sendMessengerReply } from './messengerController.js';

// Wait utility
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runBroadcastCampaign(campaignId, targets, messageText, userId, platform = 'whatsapp', minDelay = 30, maxDelay = 60) {
    try {
        let sent = 0;
        let failed = 0;

        // Load Messenger Pages if needed
        const pageTokens = {};
        if (platform === 'messenger') {
            const pages = await MessengerPage.findAll({ where: { UserId: userId, isActive: true } });
            pages.forEach(p => pageTokens[p.pageId] = p.accessToken);
        }

        for (const target of targets) {
            // Check if campaign was cancelled
            const campaign = await Campaign.findByPk(campaignId);
            if (!campaign || campaign.status === 'cancelled') {
                console.log(`Campaign ${campaignId} was cancelled.`);
                break;
            }

            try {
                if (platform === 'whatsapp') {
                    if (!target.remoteJid) continue;
                    await sendManualMessage(userId, target.remoteJid, messageText);
                } else if (platform === 'messenger') {
                    if (!target.senderId || !target.pageId) continue;
                    const token = pageTokens[target.pageId];
                    if (!token) throw new Error('No access token found for page');
                    await sendMessengerReply(target.senderId, messageText, token);
                }
                sent++;

                // Wait random time between minDelay and maxDelay
                const waitTime = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
                await delay(waitTime);

            } catch (err) {
                console.error(`Failed to send broadcast to target:`, err?.message);
                failed++;
            }

            // Update stats intermittently
            if ((sent + failed) % 5 === 0) {
                await Campaign.update({ sentCount: sent, failedCount: failed }, { where: { id: campaignId } });
            }
        }

        // Final update
        await Campaign.update({
            status: 'completed',
            sentCount: sent,
            failedCount: failed
        }, { where: { id: campaignId } });

        console.log(`Broadcast ${campaignId} completed. Sent: ${sent}, Failed: ${failed}`);

    } catch (error) {
        console.error(`Campaign ${campaignId} runtime error:`, error);
        await Campaign.update({ status: 'failed' }, { where: { id: campaignId } });
    }
}
