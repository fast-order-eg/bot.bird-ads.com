// ============================================================================
// 🛡️ CENTRALIZED WHATSAPP ANTI-BAN MESSAGE QUEUE SERVICE (FIFO)
// ============================================================================
// Ensures:
// 1. Only ONE WhatsApp message is processed/typed/sent at a time per userId (Bot Account).
// 2. Realistic human reading delay + typing/recording duration calculated from message length.
// 3. Real-time `composing` ("يكتب الآن...") or `recording` ("يسجل مقطعاً صوتياً...") presence.
// 4. Mandatory cool-down gap between consecutive messages (even across different chats/groups).
// 5. Invisible Zero-Width Hash Diversification to defeat identical-text spam detection.
// 6. Hourly rate-limit throttling protection.
// ============================================================================

const userQueues = new Map(); // userId -> { items: [], isProcessing: false }
const userHourlyMessageCount = new Map(); // userId -> { count, resetTime }
export const botSentMessageIds = new Set(); // Message IDs sent automatically by the Bot
export const botSendingJids = new Set(); // JIDs currently receiving an automated Bot message

/**
 * Calculates realistic human typing/recording duration based on message character count.
 * - Short messages (< 50 chars): 2.8s – 4.5s
 * - Medium messages (50 – 180 chars): 4.5s – 7.5s
 * - Long messages (> 180 chars): 7.5s – 11.5s
 * - Group notifications / reports: 3.5s – 6.5s
 */
export function calculateHumanTypingDuration(textLength = 50, isGroup = false, isAudio = false) {
    if (isAudio) {
        return 4500 + Math.floor(Math.random() * 3500); // 4.5s - 8.0s recording
    }
    if (isGroup) {
        const base = Math.min(Math.max(textLength * 25, 3000), 6000);
        const jitter = Math.floor(Math.random() * 1500);
        return base + jitter; // 3.0s - 7.5s
    }

    // Human typing speed ~ 35-45 ms per character, clamped between 2.8s and 11.5s
    const charTime = Math.min(Math.max(textLength * 38, 2800), 9500);
    const jitter = 500 + Math.floor(Math.random() * 2000); // +0.5s to +2.5s random jitter
    return charTime + jitter;
}

/**
 * Calculates mandatory rest/cooldown gap AFTER sending a message before starting the next item in the queue.
 */
function calculateInterMessageGap(isGroup = false) {
    if (isGroup) {
        return 2500 + Math.floor(Math.random() * 2500); // 2.5s - 5.0s
    }
    return 2000 + Math.floor(Math.random() * 2500); // 2.0s - 4.5s
}

/**
 * Injects random invisible zero-width characters into outgoing text/captions so every outgoing
 * WhatsApp message has a unique cryptographic hash while looking 100% identical to the customer.
 * NOTE: Applied ONLY on a shallow copy sent over Baileys socket so DB history & AI triggers stay clean.
 */
function diversifyTextHash(text) {
    if (!text || typeof text !== 'string') return text;
    const zwChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
    const pick = () => zwChars[Math.floor(Math.random() * zwChars.length)];

    const words = text.split(' ');
    if (words.length > 2) {
        const idx1 = Math.floor(Math.random() * (words.length - 1));
        words[idx1] = words[idx1] + pick();
        if (words.length > 5) {
            const idx2 = Math.floor(Math.random() * (words.length - 1));
            words[idx2] = words[idx2] + pick();
        }
        return words.join(' ') + pick();
    }
    return text + pick() + pick();
}

/**
 * Enqueues a WhatsApp message to be sent sequentially with human typing simulation.
 *
 * @param {object} sock - Baileys socket instance
 * @param {string} remoteJid - Target JID (customer or group)
 * @param {object|string} content - Baileys message content (e.g., { text }, { image, caption }, etc.)
 * @param {object} options - { userId, delayMs, skipTyping, readMessageKey }
 * @returns {Promise<any>} Resolves when the message is actually sent
 */
export function sendHumanizedMessage(sock, remoteJid, content, options = {}) {
    if (!sock || !remoteJid) return Promise.resolve(null);

    const queueKey = String(options.userId || 'default');
    if (!userQueues.has(queueKey)) {
        userQueues.set(queueKey, { items: [], isProcessing: false });
    }

    const queue = userQueues.get(queueKey);

    return new Promise((resolve, reject) => {
        queue.items.push({
            sock,
            remoteJid,
            content,
            options,
            resolve,
            reject,
            enqueuedAt: Date.now()
        });

        if (queue.items.length > 1) {
            console.log(`⏳ [WA-Queue] Queued message for ${remoteJid} (Account: ${queueKey}, Position in queue: ${queue.items.length})`);
        }

        processUserQueue(queueKey);
    });
}

async function processUserQueue(queueKey) {
    const queue = userQueues.get(queueKey);
    if (!queue || queue.isProcessing) return;

    queue.isProcessing = true;

    while (queue.items.length > 0) {
        const item = queue.items.shift();
        const { sock, remoteJid, options, resolve } = item;
        let { content } = item;

        try {
            const isGroup = remoteJid.endsWith('@g.us');
            const userId = options.userId;

            // 1. Hourly Rate Limit Check & Smart Slowdown
            if (userId) {
                const now = Date.now();
                let rateData = userHourlyMessageCount.get(userId) || { count: 0, resetTime: now + 3600000 };
                if (now > rateData.resetTime) {
                    rateData = { count: 0, resetTime: now + 3600000 };
                }
                rateData.count++;
                userHourlyMessageCount.set(userId, rateData);

                if (rateData.count > 70) {
                    console.warn(`⚠️ [WA-Queue RateLimiter] User ${userId} sent ${rateData.count} msgs/hour. Adding 8s safety pause.`);
                    await new Promise(r => setTimeout(r, 8000));
                } else if (rateData.count > 40) {
                    console.log(`⏱️ [WA-Queue RateLimiter] User ${userId} sent ${rateData.count} msgs/hour. Adding 3.5s safety pause.`);
                    await new Promise(r => setTimeout(r, 3500));
                }
            }

            // Normalize content & clone so caller's object is not mutated
            let textLength = 45;
            if (typeof content === 'string') {
                textLength = content.length;
                content = { text: diversifyTextHash(content) };
            } else if (typeof content === 'object' && content !== null) {
                content = { ...content };
                const extractedText = content.text || content.caption || '';
                textLength = extractedText.length || 45;
                if (content.text && typeof content.text === 'string') {
                    content.text = diversifyTextHash(content.text);
                }
                if (content.caption && typeof content.caption === 'string') {
                    content.caption = diversifyTextHash(content.caption);
                }
            }

            const isAudio = Boolean(content && content.audio);

            // 2. Human Read Receipt (inside the queue right when our turn starts!)
            if (options.readMessageKey && !isGroup) {
                try {
                    await sock.readMessages([options.readMessageKey]);
                } catch (e) {}
            }

            // 3. Initial "reading/thinking" pause before touching the keyboard (0.8s - 1.7s)
            const readingPause = 800 + Math.floor(Math.random() * 900);
            await new Promise(r => setTimeout(r, readingPause));

            // 4. Presence Update: Available + Composing ("يكتب الآن...") or Recording ("يسجل مقطعاً صوتياً...")
            const presenceType = isAudio ? 'recording' : 'composing';
            if (!options.skipTyping) {
                try { await sock.sendPresenceUpdate('available', remoteJid); } catch (e) {}
                try { await sock.sendPresenceUpdate(presenceType, remoteJid); } catch (e) {}
            }

            // 5. Dynamic Typing/Recording Duration based on message length
            const typingDuration = options.delayMs || calculateHumanTypingDuration(textLength, isGroup, isAudio);
            if (!options.skipTyping) {
                // Refresh presence every ~4 seconds if typing duration is long (> 5s)
                if (typingDuration > 5000) {
                    const firstHalf = Math.floor(typingDuration / 2);
                    const secondHalf = typingDuration - firstHalf;
                    await new Promise(r => setTimeout(r, firstHalf));
                    try { await sock.sendPresenceUpdate(presenceType, remoteJid); } catch (e) {}
                    await new Promise(r => setTimeout(r, secondHalf));
                } else {
                    await new Promise(r => setTimeout(r, typingDuration));
                }
            }

            // 6. Send the actual message (Track automated bot messages to avoid false Auto-Handoff)
            if (!options.isManual && remoteJid) {
                botSendingJids.add(remoteJid);
            }
            let res = null;
            try {
                res = await sock.sendMessage(remoteJid, content);
                if (!options.isManual && res?.key?.id) {
                    botSentMessageIds.add(res.key.id);
                    setTimeout(() => botSentMessageIds.delete(res.key.id), 60000);
                }
            } finally {
                if (!options.isManual && remoteJid) {
                    setTimeout(() => botSendingJids.delete(remoteJid), 3000);
                }
            }

            // 7. Stop Typing
            if (!options.skipTyping) {
                try {
                    await sock.sendPresenceUpdate('paused', remoteJid);
                } catch (e) {}
            }

            resolve(res);

            // 8. Mandatory Cooldown Gap before processing next queued message
            if (queue.items.length > 0) {
                const gap = calculateInterMessageGap(isGroup);
                await new Promise(r => setTimeout(r, gap));
            } else {
                // If queue is now empty, set presence to unavailable after a natural pause
                setTimeout(async () => {
                    try { await sock.sendPresenceUpdate('unavailable', remoteJid); } catch (e) {}
                }, 1500);
            }
        } catch (err) {
            console.error(`❌ [WA-Queue] Error sending message to ${remoteJid}:`, err?.message || err);
            resolve(null);
        }
    }

    queue.isProcessing = false;
}
