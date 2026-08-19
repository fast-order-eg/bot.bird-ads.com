import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadMediaMessage } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { CONFIG } from './config.js';

// Setup FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Setup Logger
const logger = pino({ level: 'info' });

// Session Directory
const SESSION_DIR = 'auth_info_baileys';

// Chat History Store
const chatHistory = {};

// --- Rate Limiting & Queue System ---
let apiQueue = Promise.resolve();
const delay = (ms) => new Promise(res => setTimeout(res, ms));

const AI_MODELS = [
    "gemini-2.0-flash-001",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
];
let currentModelIndex = 0;

async function fetchWithRetryAndQueue(payload) {
    return new Promise((resolve, reject) => {
        apiQueue = apiQueue.then(async () => {
            let maxRetries = 6; // Try up to 6 times to give a chance to cycle through all 3 models twice
            let waitTime = 1000;

            for (let i = 1; i <= maxRetries; i++) {
                try {
                    // Pick the next model in a round-robin fashion
                    const modelName = AI_MODELS[currentModelIndex];
                    currentModelIndex = (currentModelIndex + 1) % AI_MODELS.length;

                    const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/us-central1/publishers/google/models/${modelName}:generateContent?key=${CONFIG.USER_KEY}`;

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.status === 429) {
                        console.log(`[Queue] ⚠️ Rate limit 429 hit on ${modelName}. Retry ${i}/${maxRetries} in ${waitTime}ms...`);
                        await delay(waitTime);
                        waitTime += 1000;
                        continue; // try the next model
                    }

                    if (!response.ok) {
                        const errText = await response.text();
                        console.error(`Vertex Error on ${modelName} ${response.status}: ${errText}`);
                        if (i === maxRetries) {
                            reject(new Error(`Vertex Error ${response.status}: ${errText}`));
                            return;
                        }
                        continue; // try the next model silently
                    }

                    resolve(await response.json());

                    // Add shorter delay since we have 3 models handling the load (15x3 = 45 RPM)
                    await delay(1000);
                    return;
                } catch (error) {
                    if (i === maxRetries) {
                        reject(error);
                        return;
                    }
                    console.log(`[Queue] ⚠️ Error. Retry ${i}/${maxRetries} in ${waitTime}ms...`);
                    await delay(waitTime);
                    waitTime += 1000;
                }
            }
        }).catch(reject);
    });
}

// Vertex AI Helper
async function callVertexAI(remoteJid, userText, mediaBuffer = null, mediaMime = null) {
    const history = chatHistory[remoteJid] || [];
    const contents = history.map(msg => ({
        role: msg.role,
        parts: msg.parts
    }));

    // Add current message
    const currentParts = [];
    if (userText) currentParts.push({ text: userText });
    if (mediaBuffer) {
        currentParts.push({
            inline_data: {
                mime_type: mediaMime,
                data: mediaBuffer.toString('base64')
            }
        });
    }

    // Add current msg to contents for the API call
    contents.push({ role: "user", parts: currentParts });

    const payload = {
        contents: contents,
        system_instruction: {
            parts: [{ text: CONFIG.SYSTEM_INSTRUCTIONS }]
        }
    };

    try {
        const data = await fetchWithRetryAndQueue(payload);
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (reply) {
            // Update History only on success
            history.push({ role: "user", parts: currentParts });
            history.push({ role: "model", parts: [{ text: reply }] });
            chatHistory[remoteJid] = history;
            return reply;
        }
        return null;

    } catch (error) {
        console.error("AI Call Failed:", error);
        // Estimate tokens even on failure if partial content sent? No, only on success/reply.
        return "عذراً، حصل مشكلة في الاتصال بالذكاء الاصطناعي. جرب تاني كمان شوية.";
    }
}

async function handleOrderCompletion(sock, customerJid, customerName, aiResponse, history) {
    // 1. Extract Order Number
    const orderMatch = aiResponse.match(/رقم الطلب:\s*(\d+)/);
    const orderNum = orderMatch ? orderMatch[1] : "N/A";

    // 2. Extract Phone (Prioritize explicit extraction from AI summary)
    let phone = "N/A";
    const phoneMatch = aiResponse.match(/(?:رقم التواصل|رقم الهاتف|Phone):\s*([\d\+]+)/i);
    if (phoneMatch) {
        phone = phoneMatch[1].trim();
    } else {
        // Fallback to JID extraction
        phone = customerJid.split('@')[0];
    }

    // 3. Determine Service Type from History/Summary
    let serviceType = "طلب جديد";

    // Try to find "الخدمة:" line in AI response first
    const serviceMatch = aiResponse.match(/الخدمة:\s*(.+)/);
    if (serviceMatch) {
        let rawService = serviceMatch[1].trim();
        if (rawService.includes("ممول") || rawService.includes("إعلان")) serviceType = "طلب إعلان ممول جديد";
        else if (rawService.includes("تصميم")) serviceType = "طلب تصميم جديد";
        else if (rawService.includes("فيديو")) serviceType = "طلب فيديو جديد";
        else if (rawService.includes("حجز") || rawService.includes("زيارة") || rawService.includes("معاد")) serviceType = "طلب حجز معاد";
        else serviceType = rawService;
    } else {
        // Fallback to searching history
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'model') {
                const text = msg.parts ? msg.parts[0].text : "";
                if (text && text.includes("برجاء التأكيد")) {
                    const summary = text.split("برجاء التأكيد")[0].trim();
                    serviceType = detectServiceType(summary);
                    break;
                }
            }
        }
    }

    // 4. Construct Group Message
    let groupMsg = `📋 *${serviceType}*\n\n`;
    groupMsg += `👤 العميل: ${customerName}\n`;
    groupMsg += `📞 رقم التليفون: ${phone}\n`;
    groupMsg += `🔢 رقم الطلب: ${orderNum}\n\n`;

    // Add Summary details
    let summaryText = "";
    if (aiResponse.includes("ملخص الطلب:")) {
        summaryText = aiResponse.split("ملخص الطلب:")[1].split("برجاء")[0].trim();
    } else {
        for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (msg.role === 'model') {
                const text = msg.parts ? msg.parts[0].text : "";
                if (text && text.includes("برجاء التأكيد")) {
                    summaryText = text.split("برجاء التأكيد")[0].trim();
                    summaryText = summaryText.replace(/\*+$/, '').trim();
                    break;
                }
            }
        }
    }
    groupMsg += summaryText;

    // 5. Send to Group "تطبيق"
    console.log("Searching for 'تطبيق' group...");
    const groups = await sock.groupFetchAllParticipating();
    let targetGroup = null;

    for (const [jid, group] of Object.entries(groups)) {
        if (group.subject === "تطبيق") {
            targetGroup = jid;
            break;
        }
    }

    if (targetGroup) {
        await sock.sendMessage(targetGroup, { text: groupMsg });
        console.log("✅ Sent order to group 'تطبيق'");
    } else {
        console.log("❌ Group 'تطبيق' not found!");
    }
}

function detectServiceType(summary) {
    if (summary.includes("نوع التصميم: بوست") || summary.includes("منشور")) return "طلب تصميم بوست جديد";
    if (summary.includes("نوع التصميم: لوجو") || summary.includes("لوجو")) return "طلب تصميم لوجو جديد";
    if (summary.includes("نوع التصميم: كافر") || summary.includes("غلاف")) return "طلب تصميم كافر فوتو جديد";
    if (summary.includes("فيديو") || summary.includes("ريلز") || summary.includes("مونتاج")) return "طلب فيديو جديد";
    if (summary.includes("كتابة محتوى") || summary.includes("محتوى احترافي")) return "طلب كتابة محتوى جديد";
    if (summary.includes("إعلان ممول")) return "طلب إعلان ممول جديد";
    if (summary.includes("حجز") || summary.includes("ميعاد")) return "طلب حجز معاد";
    return "طلب جديد";
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("Generating QR Code...");
            qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
                if (err) console.error(err);
                console.log(url);
            });
            qrcode.toFile('qr.png', qr, { width: 400 }, (err) => {
                if (!err) console.log("\n✅ QR Code saved to 'qr.png'\n");
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('opened connection');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        try {
            const msg = m.messages[0];
            if (!msg.message) return;

            const remoteJid = msg.key.remoteJid;
            const pushName = msg.pushName || "Unknown";
            const messageType = Object.keys(msg.message)[0];

            console.log(`\n📨 ${messageType} from ${pushName} (${remoteJid})`);
            if (remoteJid === 'status@broadcast') return;
            if (msg.key.fromMe) return;

            // Initialize chat history
            if (!chatHistory[remoteJid]) chatHistory[remoteJid] = [];

            let replyText = "";

            // Handle Text
            if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
                console.log(`Text: ${text}`);
                replyText = await callVertexAI(remoteJid, text);
            }
            // Handle Voice
            else if (messageType === 'audioMessage') {
                console.log("Processing audio...");
                try {
                    const buffer = await downloadMediaMessage(
                        msg,
                        'buffer',
                        {},
                        { logger, reuploadRequest: sock.updateMediaMessage }
                    );

                    const tempInput = `temp_${Date.now()}.ogg`;
                    const tempOutput = `temp_${Date.now()}.mp3`;
                    fs.writeFileSync(tempInput, buffer);

                    await new Promise((resolve, reject) => {
                        ffmpeg(tempInput)
                            .toFormat('mp3')
                            .on('end', resolve)
                            .on('error', reject)
                            .save(tempOutput);
                    });

                    const mp3Buffer = fs.readFileSync(tempOutput);
                    replyText = await callVertexAI(remoteJid, "رسالة صوتية", mp3Buffer, "audio/mp3");

                    fs.unlinkSync(tempInput);
                    fs.unlinkSync(tempOutput);
                } catch (e) {
                    console.error("Voice Error:", e);
                    replyText = "عذراً، مش عارف اسمع الصوت ده.";
                }
            } else {
                return;
            }

            if (replyText) {
                console.log(`🤖 Reply: ${replyText}`);
                await sock.sendMessage(remoteJid, { text: replyText });

                // Check for order completion OR meeting request
                if (replyText.includes("تم إرسال طلبك بنجاح") || replyText.includes("تم تسجيل طلبك")) {
                    // Check if it has order number or is a meeting request
                    if (replyText.includes("رقم الطلب:") || replyText.includes("مسئول هيتواصل معاك")) {
                        await handleOrderCompletion(sock, remoteJid, pushName, replyText, chatHistory[remoteJid]);
                        chatHistory[remoteJid] = [];
                    }
                }
            }

        } catch (error) {
            console.error("Handler Error:", error);
        }
    });

    return sock;
}

// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start
connectToWhatsApp().catch(err => console.error("Main initialization error:", err));
