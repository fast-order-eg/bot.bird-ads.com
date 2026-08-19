import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadMediaMessage } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { CONFIG } from '../config.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Instruction from '../models/Instruction.js';
import SimulationMessage from '../models/SimulationMessage.js';
import TeachMessage from '../models/TeachMessage.js';
import { Op, Sequelize } from 'sequelize';
import { GoogleAuth } from 'google-auth-library';

// V6_STABLE_VERSION
console.log("Γ£à [V6_SIGNATURE] botController.js Loaded");

// Setup FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Logger
const logger = pino({ level: 'silent' });

// Store active sessions: userId -> socket
const sessions = new Map();

async function callVertexAI(remoteJid, userText, mediaBuffer = null, mediaMime = null, userId) {
    // 1. Fetch User Instructions from Instructions table
    const user = await User.findByPk(userId);
    const allInstructions = await Instruction.findAll({
        where: { UserId: userId, isActive: true },
        order: [['order', 'ASC'], ['createdAt', 'DESC']]
    });

    // Combine all instructions into one system prompt
    // ≡ƒºá SMART INSTRUCTION FILTERING ≡ƒºá
    // We only load instructions that are:
    // 1. Type 'global' (Always active)
    // 2. Type 'topic' AND their keywords match the user's query

    // 2. Fetch Chat History from DB FIRST to maintain context
    const dbMessages = await Message.findAll({
        where: { remoteJid, UserId: userId },
        limit: 10,
        order: [['createdAt', 'DESC']]
    });

    const normalizeText = (text) => {
        if (!text) return "";
        let t = text.toLowerCase().trim();
        t = t.replace(/[╪ú╪Ñ╪ó]/g, '╪º');
        t = t.replace(/╪⌐/g, '┘ç');
        return t;
    };

    // Combine recent history for context-aware keyword matching
    const recentHistoryText = dbMessages.slice(0, 4).map(m => m.content).join(" ");
    const combinedQuery = normalizeText(userText + " " + recentHistoryText);

    let filteredInstructions = [];
    let loadedTopics = [];

    if (allInstructions.length > 0) {
        filteredInstructions = allInstructions.filter(inst => {
            if (inst.type === 'global') return true;

            if (inst.keywords) {
                const keywords = inst.keywords.split(',').map(k => normalizeText(k));
                const isRelevant = keywords.some(k => k.length >= 2 && combinedQuery.includes(k));

                if (isRelevant) {
                    loadedTopics.push(inst.clientName);
                    return true;
                }
            }
            return false;
        });
    }

    console.log(`≡ƒñû Smart Context: Loaded ${filteredInstructions.length} instructions (Global + [${loadedTopics.join(', ')}])`);


    // Combine filtered instructions into one system prompt
    let systemInstruction = CONFIG.SYSTEM_INSTRUCTIONS;
    if (filteredInstructions.length > 0) {
        // Append custom instructions to the base identity
        systemInstruction += '\n\n' + filteredInstructions.map(inst => inst.content).join('\n\n');

        // SMART IMAGE INJECTION OPTIMIZATION
        // Only inject image descriptions if the user message contains visual keywords or is multimedia (audio/image)
        const visualKeywords = /(╪╡┘ê╪▒╪⌐|╪╡┘ê╪▒|╪┤┘â┘ä|╪┤┘â╪º┘ä|┘à┘ê╪»┘è┘ä|╪»┘è╪▓╪º┘è┘å|╪º┘ä┘ê╪º┘å|┘ä┘ê┘å|┘ê╪▒┘è┘å┘è|┘ü╪▒╪¼┘å┘è|╪º╪┤┘ê┘ü|┘à╪╣╪º┘è┘å╪⌐|╪╣┘è┘å╪⌐|╪¬┘ü╪º╪╡┘è┘ä|image|photo|pic|picture|show|see|look|color|design|details)/i;
        const shouldInjectImages = (userText && visualKeywords.test(userText)) || mediaBuffer;

        if (shouldInjectImages) {
            // Add information about available images (Multi-Image Support) - ONLY for filtered instructions
            const instructionsWithImages = filteredInstructions.filter(inst => inst.imageUrl);
            if (instructionsWithImages.length > 0) {
                systemInstruction += '\n\n≡ƒô╕ **╪º┘ä╪╡┘ê╪▒ ╪º┘ä┘à╪¬╪º╪¡╪⌐ (╪º┘ä┘à╪╣╪▒╪╢):**\n';

                instructionsWithImages.forEach(inst => {
                    let images = [];
                    try {
                        if (inst.imageUrl.startsWith('[')) {
                            images = JSON.parse(inst.imageUrl);
                        } else {
                            images = [{ url: inst.imageUrl, description: '╪º┘ä╪╡┘ê╪▒╪⌐ ╪º┘ä╪ú╪│╪º╪│┘è╪⌐' }];
                        }
                    } catch (e) {
                        images = [{ url: inst.imageUrl, description: '╪º┘ä╪╡┘ê╪▒╪⌐ ╪º┘ä╪ú╪│╪º╪│┘è╪⌐' }];
                    }

                    if (images.length > 0) {
                        const shortName = inst.keywords ? inst.keywords.split(',')[0].trim() : inst.clientName;
                        systemInstruction += `- موضوع (أو منتج): "${shortName}" يحتوي على الصور التالية:\n`;
                        images.forEach((img, idx) => {
                            const desc = img.description || `╪╡┘ê╪▒╪⌐ ╪▒┘é┘à ${idx + 1}`;
                            systemInstruction += `  ΓÇó ┘ê╪╡┘ü ╪º┘ä╪╡┘ê╪▒╪⌐: "${desc}"\n`;
                        });
                    }
                });
                systemInstruction += '\n≡ƒÆí **╪¬╪╣┘ä┘è┘à╪º╪¬ ┘ç╪º┘à╪⌐ ╪¼╪»╪º┘ï ┘ä╪Ñ╪▒╪│╪º┘ä ╪º┘ä╪╡┘ê╪▒:**\n';
                systemInstruction += '1. ╪╣┘å╪»┘à╪º ┘è╪╖┘ä╪¿ ╪º┘ä╪╣┘à┘è┘ä ╪╡┘ê╪▒╪º┘ï (╪│┘ê╪º╪í ┘å╪╡┘è╪º┘ï ╪ú┘ê ╪╡┘ê╪¬┘è╪º┘ï)╪î **┘è╪¼╪¿** ╪ú┘å ╪¬╪░┘â╪▒ "╪º╪│┘à ╪º┘ä┘à┘å╪¬╪¼" ╪¿╪»┘é╪⌐ ┘ü┘è ╪▒╪»┘â.\n';
                systemInstruction += '2. Γ¢ö **┘à┘à┘å┘ê╪╣ ╪º┘ä╪▒╪»┘ê╪» ╪º┘ä╪╣╪º┘à╪⌐** ┘à╪½┘ä "╪¬┘ü╪╢┘ä ╪º┘ä╪╡┘ê╪▒" ╪ú┘ê "┘ç╪░┘ç ╪╡┘ê╪▒ ╪º┘ä┘à┘ê╪»┘è┘ä╪º╪¬".\n';
                systemInstruction += '3. Γ£à **╪º┘ä╪╡╪¡┘è╪¡:** "╪¬┘ü╪╢┘ä╪î ┘ç╪░┘ç ╪╡┘ê╪▒ [╪º╪│┘à ╪º┘ä┘à┘å╪¬╪¼] ╪º┘ä┘à╪¬╪º╪¡╪⌐" (┘à╪½╪º┘ä: "╪¬┘ü╪╢┘ä ╪╡┘ê╪▒ ╪º┘ä╪¼┘è┘å╪▓" ╪ú┘ê "╪Ñ┘ä┘è┘â ╪╡┘ê╪▒ ╪º┘ä┘ç┘ê╪»┘è").\n';
                systemInstruction += '5. ≡ƒÄñ **┘ü┘è ╪¡╪º┘ä╪⌐ ╪º┘ä╪▒╪│╪º╪ª┘ä ╪º┘ä╪╡┘ê╪¬┘è╪⌐:** ╪│┘è╪╕┘ç╪▒ ┘ä┘â ╪º┘ä┘å╪╡ "╪▒╪│╪º┘ä╪⌐ ╪╡┘ê╪¬┘è╪⌐". ┘ü┘è ┘ç╪░┘ç ╪º┘ä╪¡╪º┘ä╪⌐╪î ┘è╪¼╪¿ ╪ú┘å ╪¬┘â┘ê┘å ╪»┘é┘è┘é╪º┘ï ╪¼╪»╪º┘ï ┘ê╪¬╪░┘â╪▒ ╪º╪│┘à ╪º┘ä┘à┘å╪¬╪¼. ┘ä╪º ╪¬┘é┘ä "╪╡┘ê╪▒ ╪º┘ä┘à┘ê╪»┘è┘ä╪º╪¬" ╪ú╪¿╪»╪º┘ï╪î ╪¿┘ä ┘é┘ä "╪╡┘ê╪▒ [╪º┘ä┘à┘å╪¬╪¼]".\n';
                systemInstruction += '6. ┘à╪½╪º┘ä: ┘ä┘ê ╪º┘ä╪╣┘à┘è┘ä ╪│╪ú┘ä ╪¿╪╡┘ê╪¬┘ç ╪╣┘å "╪º┘ä╪¼┘è┘å╪▓"╪î ┘ä╪º ╪¬╪▒╪» "╪¬┘ü╪╢┘ä ╪╡┘ê╪▒ ╪º┘ä┘à┘ê╪»┘è┘ä╪º╪¬"╪î ╪¿┘ä ╪▒╪»: "╪¬┘ü╪╢┘ä ╪╡┘ê╪▒ ╪º┘ä╪¼┘è┘å╪▓ ╪º┘ä┘à╪¬╪º╪¡╪⌐".\n';
                systemInstruction += '7. ≡ƒ¢æ **┘é╪º╪╣╪»╪⌐ ┘ç╪º┘à╪⌐ ┘ä┘ä┘é┘ê╪º╪ª┘à:** ┘ä┘ê ╪º┘ä╪╣┘à┘è┘ä ╪│╪ú┘ä ╪╣┘å "╪ú╪│╪╣╪º╪▒ ╪º┘ä╪¼┘è┘å╪▓" ┘ê╪╣┘å╪»┘â ╪ú┘å┘ê╪º╪╣ ┘â╪¬┘è╪▒ (┘â┘ä╪º╪│┘è┘â╪î ┘ê╪º┘è╪» ┘ä┘è╪¼╪î ╪Ñ┘ä╪«)╪î **┘ä╪º ╪¬╪▒╪│┘ä ╪╡┘ê╪▒┘ç┘à ┘â┘ä┘ç┘à ┘à╪▒╪⌐ ┘ê╪º╪¡╪»╪⌐**.\n';
                systemInstruction += '8. ╪«╪╖╪ú: "╪╣┘å╪»┘å╪º ┘â┘ä╪º╪│┘è┘â ╪¿┘Ç 100 (┘ê╪»┘è ╪╡┘ê╪▒╪¬┘ç) ┘ê┘ê╪º┘è╪» ┘ä┘è╪¼ ╪¿┘Ç 200 (┘ê╪»┘è ╪╡┘ê╪▒╪¬┘ç)..."\n';
                systemInstruction += '9. ╪╡╪¡: ╪º╪┤╪▒╪¡ ╪º┘ä╪ú╪│╪╣╪º╪▒ ┘â╪¬╪º╪¿╪⌐ ┘ü┘é╪╖ ╪ú┘ê┘ä╪º┘ï╪î ┘ê╪¿╪╣╪»┘è┘å ╪º╪│╪ú┘ä┘ç: "╪¬╪¡╪¿ ╪¬╪┤┘ê┘ü ╪╡┘ê╪▒ ┘ä╪ú┘å┘ç┘è ┘à┘ê╪»┘è┘ä ┘ü┘è┘ç┘à╪ƒ".\n';
                systemInstruction += '10. ┘ä┘à╪º ╪º┘ä╪╣┘à┘è┘ä ┘è╪«╪¬╪º╪▒ "╪º┘ä┘ê╪º┘è╪» ┘ä┘è╪¼"╪î ╪│╪º╪╣╪¬┘ç╪º ╪¿╪│ ╪▒╪»: "╪¬┘à╪º┘à╪î ╪»┘è ╪╡┘ê╪▒ ╪º┘ä┘ê╪º┘è╪» ┘ä┘è╪¼".\n';
            }
        }
    }

    // Strict anti-hallucination and handoff instruction
    systemInstruction += '\n\n 💡 **تعليمات صارمة جداً (يمنع مخالفتها):**\n';
    systemInstruction += '1. أنت مساعد ذكي وملتزم جداً بالتعليمات والبيانات المتوفرة لك فقط.\n';
    systemInstruction += '2. إذا سألك العميل عن أي سؤال أو سعر لا يوجد إجابته في السياق الذي أمامك، يمنع منعاً باتاً تأليف أي إجابة من خيالك.\n';
    systemInstruction += '3. إذا شعرت بالارتباك أو طلب العميل التحدث لموظف بشري، يجب عليك الرد بكلمة واحدة فقط وهي بالضبط: [HANDOFF]\n';
    systemInstruction += '4. لا تكتب أي كلام آخر مع كلمة [HANDOFF].\n';

    const history = dbMessages.reverse().map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
    }));

    // 3. Prepare Current Request
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

    // Add current message to history for the API call
    history.push({ role: "user", parts: currentParts });

    const contents = history;

        // Vertex AI URL
        const location = 'us-central1';
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/${location}/publishers/google/models/${CONFIG.MODEL_NAME}:generateContent`;

        const payload = {
            contents: contents,
            system_instruction: {
                parts: [{ text: systemInstruction }]
            },
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                topK: 20
            }
        };

        // DEBUG SYSTEM PROMPT AND AI BEHAVIOR
        console.log("=== SYSTEM INSTRUCTION SENT TO VERTEX AI ===");
        console.log(systemInstruction.substring(systemInstruction.length - 1000)); // Print last 1000 chars of system prompt
        console.log("==========================================");

    try {
        // Initialize auth with Service Account credentials
        const auth = new GoogleAuth({
            keyFilename: CONFIG.GOOGLE_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'trim-bot-486500-h8-4b614b18f7c0.json',
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });

        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken.token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Vertex AI Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // DEBUG: Print AI reply to see what it actually returns
        console.log(`[AI Reply Debug] Raw reply: "${reply?.substring(0, 200)}..."`);

        // --- PRECISE TOKEN COUNTING (OFFICIAL) ---
        let totalTokens = 0;

        if (data.usageMetadata && data.usageMetadata.totalTokenCount) {
            // Use OFFICIAL Google Usage Metadata
            totalTokens = data.usageMetadata.totalTokenCount;
            // console.log(`≡ƒôè Official Token Usage: ${totalTokens} (Prompt: ${data.usageMetadata.promptTokenCount}, Candidates: ${data.usageMetadata.candidatesTokenCount})`);
        } else {
            // FALLBACK TO ESTIMATION (If metadata is missing)
            // Estimate: 4 chars = 1 token (approx)
            let totalChars = 0;

            // Input chars
            totalChars += systemInstruction.length;
            contents.forEach(msg => {
                if (msg.parts && msg.parts[0] && msg.parts[0].text) {
                    totalChars += msg.parts[0].text.length;
                }
            });

            // Output chars
            if (reply) {
                totalChars += reply.length;
            }

            totalTokens = Math.ceil(totalChars / 4);
            // console.log(`ΓÜá∩╕Å Estimated Token Usage: ${totalTokens} (Metadata missing)`);
        }

        // Update user with precise count
        if (user) {
            await user.increment('total_tokens', { by: totalTokens });
        }
        // ------------------------

        return reply || null;
    } catch (error) {
        console.error("AI Call Failed:", error);
        return "╪╣╪░╪▒╪º┘ï╪î ╪¡╪╡┘ä ┘à╪┤┘â┘ä╪⌐ ┘ü┘è ╪º┘ä╪º╪¬╪╡╪º┘ä ╪¿╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è.";
    }
}

async function handleOrderCompletion(sock, customerJid, lastMessage, aiResponse, userId) {
    try {
        // 1. Extract order number from AI response
        const orderNumMatch = aiResponse.match(/╪▒┘é┘à ╪º┘ä╪╖┘ä╪¿:\s*(\d+)/);
        const orderNum = orderNumMatch ? orderNumMatch[1] : "N/A";

        // 2. Get customer name from WhatsApp
        let customerName = customerJid.split('@')[0]; // Default: phone number
        try {
            const contact = await sock.onWhatsApp(customerJid);
            if (contact && contact[0] && contact[0].notify) {
                customerName = contact[0].notify;
            }
        } catch (error) {
            console.log("ΓÜá∩╕Å Could not fetch customer name, using JID");
        }

        // 3. Find the appropriate instruction with actionTarget
        const instructions = await Instruction.findAll({
            where: { UserId: userId },
            order: [['order', 'ASC'], ['createdAt', 'DESC']]
        });

        let targetGroup = null;

        // Find instruction with actionTarget set
        for (const inst of instructions) {
            if (inst.actionTarget) {
                targetGroup = inst.actionTarget;
                console.log(`≡ƒôñ Target group found: ${targetGroup}`);
                break;
            }
        }

        if (!targetGroup) {
            console.log("ΓÜá∩╕Å No actionTarget set in instructions. Skipping group forward.");
            return;
        }

        // 4. Extract order summary from chat history
        const messages = await Message.findAll({
            where: { remoteJid: customerJid, UserId: userId },
            limit: 30,
            order: [['createdAt', 'DESC']]
        });

        // Find the confirmation message (with "╪¿╪▒╪¼╪º╪í ╪º┘ä╪¬╪ú┘â┘è╪»") or fallback to last AI message
        let orderSummary = "┘ä┘à ┘è╪¬┘à ╪º┘ä╪╣╪½┘ê╪▒ ╪╣┘ä┘ë ┘à┘ä╪«╪╡ ╪º┘ä╪╖┘ä╪¿";

        // Strategy 1: Look for "╪¿╪▒╪¼╪º╪í ╪º┘ä╪¬╪ú┘â┘è╪»"
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'model' && messages[i].content.includes("╪¿╪▒╪¼╪º╪í ╪º┘ä╪¬╪ú┘â┘è╪»")) {
                const content = messages[i].content;
                const summaryMatch = content.split("╪¿╪▒╪¼╪º╪í ╪º┘ä╪¬╪ú┘â┘è╪»")[0];
                if (summaryMatch) {
                    orderSummary = summaryMatch.trim().replace(/\*\*$/g, '').trim();
                }
                break;
            }
        }

        // Strategy 2: Fallback to the immediate last AI message (before the current success message)
        if (orderSummary === "┘ä┘à ┘è╪¬┘à ╪º┘ä╪╣╪½┘ê╪▒ ╪╣┘ä┘ë ┘à┘ä╪«╪╡ ╪º┘ä╪╖┘ä╪¿") {
            // Filter for model messages, excluding the current one (which likely has '╪¬┘à ╪º╪▒╪│╪º┘ä ╪╖┘ä╪¿┘â')
            const aiMessages = messages.filter(m => m.role === 'model' && !m.content.includes("╪¬┘à ╪Ñ╪▒╪│╪º┘ä ╪╖┘ä╪¿┘â"));
            if (aiMessages.length > 0) {
                // Get the most recent one
                orderSummary = aiMessages[aiMessages.length - 1].content;
                console.log("ΓÜá∩╕Å Used fallback strategy for order summary.");
            }
        }

        // 5. Determine service type from summary
        let serviceType = "╪╖┘ä╪¿ ╪¼╪»┘è╪»";
        if (orderSummary.includes("╪¿┘ê╪│╪¬") || orderSummary.includes("┘à┘å╪┤┘ê╪▒")) {
            serviceType = "╪╖┘ä╪¿ ╪¬╪╡┘à┘è┘à ╪¿┘ê╪│╪¬ ╪¼╪»┘è╪»";
        } else if (orderSummary.includes("┘ä┘ê╪¼┘ê")) {
            serviceType = "╪╖┘ä╪¿ ╪¬╪╡┘à┘è┘à ┘ä┘ê╪¼┘ê ╪¼╪»┘è╪»";
        } else if (orderSummary.includes("┘â╪º┘ü╪▒") || orderSummary.includes("╪║┘ä╪º┘ü")) {
            serviceType = "╪╖┘ä╪¿ ╪¬╪╡┘à┘è┘à ┘â╪º┘ü╪▒ ┘ü┘ê╪¬┘ê ╪¼╪»┘è╪»";
        } else if (orderSummary.includes("╪¿╪º┘å╪▒")) {
            serviceType = "╪╖┘ä╪¿ ╪¬╪╡┘à┘è┘à ╪¿╪º┘å╪▒ ╪¼╪»┘è╪»";
        } else if (orderSummary.includes("┘ü┘è╪»┘è┘ê") || orderSummary.includes("╪▒┘è┘ä╪▓") || orderSummary.includes("┘à┘ê┘å╪¬╪º╪¼")) {
            serviceType = "╪╖┘ä╪¿ ┘ü┘è╪»┘è┘ê ╪¼╪»┘è╪»";
        } else if (orderSummary.includes("┘à╪¡╪¬┘ê┘ë") || orderSummary.includes("┘â╪¬╪º╪¿╪⌐")) {
            serviceType = "╪╖┘ä╪¿ ┘â╪¬╪º╪¿╪⌐ ┘à╪¡╪¬┘ê┘ë ╪¼╪»┘è╪»";
        } else if (orderSummary.includes("╪Ñ╪╣┘ä╪º┘å ┘à┘à┘ê┘ä")) {
            serviceType = "╪╖┘ä╪¿ ╪Ñ╪╣┘ä╪º┘å ┘à┘à┘ê┘ä ╪¼╪»┘è╪»";
        }

        // 6. Build group message
        let groupMsg = `≡ƒôï ${serviceType}\n\n`;
        groupMsg += `≡ƒæñ ╪º┘ä╪╣┘à┘è┘ä: ${customerName}\n`;
        groupMsg += `≡ƒô₧ ╪▒┘é┘à ╪º┘ä╪¬┘ä┘è┘ü┘ê┘å: ${customerJid.split('@')[0]}\n`;
        groupMsg += `≡ƒöó ╪▒┘é┘à ╪º┘ä╪╖┘ä╪¿: ${orderNum}\n\n`;
        groupMsg += orderSummary;

        // 7. Search for group by name
        console.log(`≡ƒöì Searching for group: "${targetGroup}"...`);

        const groups = await sock.groupFetchAllParticipating();
        let targetGroupJid = null;

        for (const groupId in groups) {
            const group = groups[groupId];
            if (group.subject === targetGroup) {
                targetGroupJid = groupId;
                console.log(`Γ£à Found group: ${targetGroup} (${groupId})`);
                break;
            }
        }

        if (!targetGroupJid) {
            console.log(`Γ¥î Group "${targetGroup}" not found!`);
            console.log(`Available groups: ${Object.values(groups).map(g => g.subject).join(', ')}`);
            return;
        }

        // 8. Send message to group
        await sock.sendMessage(targetGroupJid, { text: groupMsg });
        console.log(`Γ£à Order forwarded to group "${targetGroup}"!`);

    } catch (error) {
        console.error("Γ¥î handleOrderCompletion Error:", error);
    }
}

export const startSession = async (userId, io, phoneNumber = null) => {
    // Enable Auto Reply in DB
    const user = await User.findByPk(userId);

    // Check if resuming from Manual Pause
    if (user.connection_status === 'paused_manual' || user.pause_until) {
        console.log(`[Dashboard] Resuming manual pause for User ${userId}`);

        // Notify Control Group
        if (user.control_group_jid && sessions.has(userId)) {
            const sock = sessions.get(userId);
            if (sock.user) {
                try {
                    await sock.sendMessage(user.control_group_jid, { text: 'Γ£à ╪¬┘à ╪¬╪┤╪║┘è┘ä ╪º┘ä╪¿┘ê╪¬ ┘à┘å ┘ä┘ê╪¡╪⌐ ╪º┘ä╪¬╪¡┘â┘à.' });
                } catch (e) {
                    console.error("Error notifying control group:", e);
                }
            }
        }
    }

    await User.update({ auto_reply: true, connection_status: 'online', pause_until: null }, { where: { id: userId } });

    if (sessions.has(userId)) {
        const sock = sessions.get(userId);
        // Only return 'already_running' if actually authenticated
        if (sock.user) {
            io.to(`user_${userId}`).emit('status', { status: 'online', phone: sock.user.id.split(':')[0].split('@')[0], name: sock.user.name || "My Bot" });
            return { status: 'already_running', message: 'Bot Auto-Reply Enabled' };
        }
        // If session exists but not authenticated (stuck in QR loop?), better to just continue and let it re-init or just return status
        // Check if connection is working
        // return { status: 'connecting', message: 'Waiting for connection...' };
    }

    const authPath = path.join('sessions', `auth_info_${userId}`);
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: !phoneNumber, // Only print QR if no phone number
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Simulate a browser
        generateHighQualityLinkPreview: true,
    });

    sessions.set(userId, sock);

    // Pairing Code Logic
    if (phoneNumber && !sock.authState.creds.registered) {
        // Sanitize phone number (remove +, spaces, dashes)
        const sanitizedPhone = phoneNumber.replace(/[^0-9]/g, '');

        setTimeout(async () => {
            try {
                console.log(`Requesting pairing code for: ${sanitizedPhone}`);
                const code = await sock.requestPairingCode(sanitizedPhone);
                console.log(`Pairing Code for User ${userId}: ${code}`);
                io.to(`user_${userId}`).emit('pairing_code', code);
            } catch (err) {
                console.error("Pairing Code Error:", err);
                io.to(`user_${userId}`).emit('pairing_error', err.message);
            }
        }, 4000); // Wait 4s to ensure connection init
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !phoneNumber) io.to(`user_${userId}`).emit('qr_code', qr); // Only emit QR if not using pairing code

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                sessions.delete(userId);
                startSession(userId, io);
            } else {
                console.log(`User ${userId} logged out`);
                // Clear linked phone number and update status
                await User.update({ linked_phone_number: null, auto_reply: false, connection_status: 'not_registered' }, { where: { id: userId } });

                sessions.delete(userId);
                io.to(`user_${userId}`).emit('status', 'not_registered');
                try {
                    fs.rmSync(authPath, { recursive: true, force: true });
                } catch (e) {
                    console.error("Error removing auth path:", e);
                }
            }
        } else if (connection === 'open') {
            console.log(`User ${userId} connected`);
            const id = sock.user.id.split(':')[0].split('@')[0];
            const name = sock.user.name || "My Bot";

            // SAVE PHONE and STATUS TO DB
            await User.update({ linked_phone_number: id, connection_status: 'online' }, { where: { id: userId } });

            io.to(`user_${userId}`).emit('status', { status: 'online', phone: id, name: name });
        }
    });

    const ABKARINO_API_URL = 'http://localhost:8000/api/bot/chat';

    async function callAbkarinoAPI(text, userId) {
        try {
            const response = await fetch(ABKARINO_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    message: text,
                    history: [] // History is managed by agent internally or we can fetch it
                })
            });

            if (!response.ok) {
                console.error(`Abkarino API Error: ${response.status} ${response.statusText}`);
                return "╪╣╪░╪▒╪º┘ï╪î ╪¡╪»╪½ ╪«╪╖╪ú ┘ü┘è ╪º┘ä╪º╪¬╪╡╪º┘ä ╪¿╪╣╪¿┘é╪▒┘è┘å┘ê.";
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error("Abkarino API Call Failed:", error);
            return "╪╣╪░╪▒╪º┘ï╪î ╪╣╪¿┘é╪▒┘è┘å┘ê ┘à╪┤ ┘à╪¬╪º╪¡ ╪¡╪º┘ä┘è╪º┘ï.";
        }
    }

    // ... (Existing functions)

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];

        // 0. Auto-Handoff on Manual Reply
        if (msg.key.fromMe) {
            const remoteJid = msg.key.remoteJid;
            if (remoteJid && !remoteJid.endsWith('@g.us') && remoteJid !== 'status@broadcast') {
                try {
                    await Conversation.update(
                        { is_handoff: true },
                        { where: { UserId: userId, remoteJid } }
                    );
                    console.log(`[Auto-Handoff] Owner replied manually to ${remoteJid}. Bot paused for this chat.`);
                } catch (e) {
                    console.error("Auto-Handoff Error:", e);
                }
            }
            return; // Ignore fromMe messages so bot doesn't process them
        }

        if (!msg.message) return;

        const remoteJid = msg.key.remoteJid;
        if (remoteJid === 'status@broadcast') return;
        const messageType = Object.keys(msg.message)[0];

        let text = "";
        if (messageType === 'conversation') text = msg.message.conversation;
        else if (messageType === 'extendedTextMessage') text = msg.message.extendedTextMessage.text;
        else if (messageType === 'audioMessage') text = "╪▒╪│╪º┘ä╪⌐ ╪╡┘ê╪¬┘è╪⌐";

        // 1. Save User Message to DB (ALWAYS)
        if (text) {
            const savedMsg = await Message.create({
                UserId: userId,
                remoteJid,
                role: 'user',
                content: text
            });
            io.to(`user_${userId}`).emit('new_message', savedMsg);
        }

        // 2. Check for "Lina Control" or "Abkarino" Group Message (High Priority)
        if (remoteJid.endsWith('@g.us')) {
            try {
                // Fetch group metadata to check name
                const groupMetadata = await sock.groupMetadata(remoteJid);

                // Check for "Lina" Group (Control Center)
                if (groupMetadata.subject && (groupMetadata.subject.includes("لينا") || groupMetadata.subject.toLowerCase().includes("lina"))) {
                    console.log(`≡ƒöº Lina Control Group Message: ${text}`);

                    const normalizeCmd = text.trim().toLowerCase();
                    const user = await User.findByPk(userId);

                    // CRITICAL: Check subscription expiry FIRST
                    if (user.expiry_date) {
                        const today = new Date().toISOString().split('T')[0];
                        if (user.expiry_date < today) {
                            console.log(`[Lina Group] Subscription expired for user ${userId}. Ignoring command.`);
                            return;
                        }
                    }

                    // 1. STOP Command
                    if (normalizeCmd === '╪Ñ┘è┘é╪º┘ü' || normalizeCmd === '╪º┘è┘é╪º┘ü' || normalizeCmd === 'stop') {
                        user.connection_status = 'paused_manual';
                        user.pause_until = null;
                        user.control_group_jid = remoteJid;
                        await user.save();
                        await sock.sendMessage(remoteJid, { text: 'Γ£à ╪¬┘à ╪Ñ┘è┘é╪º┘ü ╪º┘ä╪¿┘ê╪¬ ╪╣┘å ╪º┘ä╪▒╪» ╪¬┘ä┘é╪º╪ª┘è╪º┘ï ╪╣┘ä┘ë ╪¼┘à┘è╪╣ ╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬.' });
                        return;
                    }

                    // 2. START Command
                    if (normalizeCmd === '╪¬╪┤╪║┘è┘ä' || normalizeCmd === 'start') {
                        user.connection_status = 'online';
                        user.pause_until = null;
                        user.control_group_jid = remoteJid;
                        await user.save();
                        await sock.sendMessage(remoteJid, { text: 'Γ£à ╪¬┘à ╪Ñ╪╣╪º╪»╪⌐ ╪¬╪┤╪║┘è┘ä ╪º┘ä╪¿┘ê╪¬ ┘ä┘ä╪▒╪» ╪╣┘ä┘ë ╪º┘ä╪¼┘à┘è╪╣.' });
                        return;
                    }

                    // 3. WAIT Command
                    if (normalizeCmd.startsWith('╪º┘å╪¬╪╕╪▒') || normalizeCmd.startsWith('wait')) {
                        // Parse duration or ask for it
                        // Simple parsing for now: "╪º┘å╪¬╪╕╪▒ 15 ╪»┘é┘è┘é╪⌐"
                        // Regex to capture number and unit
                        const match = normalizeCmd.match(/(\d+)\s*(╪»┘é┘è┘é╪⌐|╪»┘é╪º╪ª┘é|╪│╪º╪╣╪⌐|╪│╪º╪╣╪º╪¬|┘è┘ê┘à|╪ú┘è╪º┘à|min|mins|hour|hours|day|days)/);

                        if (match) {
                            const num = parseInt(match[1]);
                            const unit = match[2];
                            let durationMs = 0;

                            if (unit.includes('╪»') || unit.includes('min')) durationMs = num * 60 * 1000;
                            else if (unit.includes('╪│') || unit.includes('hour')) durationMs = num * 60 * 60 * 1000;
                            else if (unit.includes('┘è') || unit.includes('day')) durationMs = num * 24 * 60 * 60 * 1000;

                            const unlockTime = new Date(Date.now() + durationMs);

                            user.connection_status = 'paused_manual';
                            user.pause_until = unlockTime;
                            user.control_group_jid = remoteJid;
                            await user.save();

                            const dateStr = unlockTime.toLocaleDateString('en-GB'); // DD/MM/YYYY
                            const timeStr = unlockTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });

                            await sock.sendMessage(remoteJid, { text: `Γ£à ╪¬┘à ╪Ñ┘è┘é╪º┘ü ╪º┘ä╪▒╪» ┘à╪ñ┘é╪¬╪º┘ï ┘ä┘à╪»╪⌐ ${num} ${unit}.\n\n╪│┘è╪¬┘à ╪º┘ä╪º╪│╪¬╪ª┘å╪º┘ü ╪¬┘ä┘é╪º╪ª┘è╪º┘ï ┘ü┘è:\n${dateStr}\n╪º┘ä╪│╪º╪╣╪⌐\n${timeStr}` });

                        } else {
                            // If just "╪º┘å╪¬╪╕╪▒", ask for duration? 
                            // For simplicity in V1, let's just ask to specify.
                            await sock.sendMessage(remoteJid, { text: 'ΓÜá∩╕Å ┘è╪▒╪¼┘ë ╪¬╪¡╪»┘è╪» ╪º┘ä┘à╪»╪⌐. ┘à╪½╪º┘ä: "╪º┘å╪¬╪╕╪▒ 15 ╪»┘é┘è┘é╪⌐" ╪ú┘ê "╪º┘å╪¬╪╕╪▒ 2 ╪│╪º╪╣╪⌐".' });
                        }
                        return;
                    }

                    // If message is in Lina group but NOT a command, ignore it (do not send to AI)
                    return;
                }

                // Check for "╪╣╪¿┘é╪▒┘è┘å┘ê" Group Message (High Priority) - Original Logic kept but moved after Lina check
                if (groupMetadata.subject && groupMetadata.subject.includes("╪╣╪¿┘é╪▒┘è┘å┘ê")) {
                    console.log(`≡ƒñû Abkarino Group Message: ${text}`);

                    // Simulate Typing
                    await sock.sendPresenceUpdate('composing', remoteJid);

                    // Call Abkarino API
                    const replyText = await callAbkarinoAPI(text, userId);

                    // Stop Typing
                    await sock.sendPresenceUpdate('paused', remoteJid);

                    // Send Reply
                    await sock.sendMessage(remoteJid, { text: replyText });

                    // Save Bot Reply
                    const savedResponse = await Message.create({
                        UserId: userId,
                        remoteJid,
                        role: 'model',
                        content: replyText
                    });
                    io.to(`user_${userId}`).emit('new_message', savedResponse);
                    return; // Stop processing further
                }
            } catch (err) {
                console.error("Error checking group name:", err);
            }
        }

        // 3. Check Auto-Reply Status (For Customers)
        const user = await User.findByPk(userId);
        if (!user.auto_reply) {
            console.log(`Auto-reply disabled for user ${userId}. Skipping response.`);
            return;
        }

        // 3.1. Check Subscription Expiry
        if (user.expiry_date) {
            const today = new Date().toISOString().split('T')[0];
            if (user.expiry_date < today) {
                console.log(`Subscription expired for user ${userId}. Skipping response.`);
                return;
            }
        }

        // 3.5. Check Manual Pause / Timer
        // If status is 'paused_manual', check if we have a timer
        if (user.connection_status === 'paused_manual') {
            if (user.pause_until) {
                // Timer is active
                if (new Date() < new Date(user.pause_until)) {
                    console.log(`Bot paused for user ${userId} until ${user.pause_until}`);
                    return;
                    // If timer expired, it should be caught by cron, but if we catch it here first:
                } else {
                    // Timer expired just now, let's auto-resume?
                    // Better let the background job handle notification, or handle here silently.
                    // For consistency, let's treat it as active if time passed.
                    console.log(`User ${userId} pause time expired. Resuming flow.`);
                    user.connection_status = 'online';
                    user.pause_until = null;
                    await user.save();
                    // Notify admin group? Maybe later in background job. 
                }
            } else {
                // Infinite manual pause
                console.log(`Bot manually paused for user ${userId}.`);
                return;
            }
        }

        // 3.6 Find or Create Conversation (Only for Private Chats)
        let conversation = null;
        if (!remoteJid.endsWith('@g.us')) {
            const pushName = msg.pushName || remoteJid.split('@')[0];
            let created;
            [conversation, created] = await Conversation.findOrCreate({
                where: { UserId: userId, remoteJid },
                defaults: {
                    platform: 'whatsapp',
                    customerName: pushName,
                    lastMessageText: text,
                    unreadCount: 1,
                }
            });

            if (!created) {
                conversation.lastMessageText = text;
                conversation.lastMessageAt = new Date();
                conversation.unreadCount += 1; 
                if (pushName && pushName !== remoteJid.split('@')[0]) {
                    conversation.customerName = pushName;
                }
                await conversation.save();
            }

            // 3.7 Handle Handoff (Is Human taking over?)
            if (conversation.is_handoff) {
                console.log(`[Handoff] Bot paused for chat ${remoteJid}. Human is handling it.`);
                return;
            }
        }

        // 4. Ignore Group Messages (Safety - Already handled Abkarino & Lina group above)
        if (remoteJid.endsWith('@g.us')) {
            // Double check if it's the control group, just in case
            try {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                if (groupMetadata.subject && (groupMetadata.subject.includes("لينا") || groupMetadata.subject.toLowerCase().includes("lina"))) {
                    console.log(`[Safety Check] Allowed Lina group message to pass through ignore block: ${remoteJid}`);
                    // Allowed Lina group msg to proceed to AI.
                } else {
                    console.log(`Ignoring other group message from: ${remoteJid}`);
                    return;
                }
            } catch (e) {
                console.log(`Ignoring group message (metadata fetch failed) from: ${remoteJid}`);
                return;
            }
        }

        // 5. Process AI Response (Vertex AI for Customers)
        // Simulate Typing
        await sock.sendPresenceUpdate('composing', remoteJid);

        let replyText = "";
        if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
            replyText = await callVertexAI(remoteJid, text, null, null, userId);
        } else if (messageType === 'audioMessage') {
            // ... (Voice handling logic same as before)
            // For brevity, assuming voice logic remains similar or reusing existing callVertexAI with voice support
            console.log("≡ƒÄñ Processing audio message...");
            try {
                const buffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    { logger, reuploadRequest: sock.updateMediaMessage }
                );

                const tempInput = path.join(os.tmpdir(), `temp_${Date.now()}.ogg`);
                const tempOutput = path.join(os.tmpdir(), `temp_${Date.now()}.mp3`);
                fs.writeFileSync(tempInput, buffer);

                await new Promise((resolve, reject) => {
                    ffmpeg(tempInput)
                        .toFormat('mp3')
                        .on('end', resolve)
                        .on('error', reject)
                        .save(tempOutput);
                });

                const mp3Buffer = fs.readFileSync(tempOutput);
                replyText = await callVertexAI(remoteJid, "╪▒╪│╪º┘ä╪⌐ ╪╡┘ê╪¬┘è╪⌐", mp3Buffer, "audio/mp3", userId);

                if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
                if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);

            } catch (e) {
                console.error("Γ¥î Voice Error:", e);
                replyText = "╪╣╪░╪▒╪º┘ï╪î ┘à╪┤ ╪╣╪º╪▒┘ü ╪º╪│┘à╪╣ ╪º┘ä╪╡┘ê╪¬ ╪»┘ç ╪»┘ä┘ê┘é╪¬┘è.";
            }
        }

        // Stop Typing
        await sock.sendPresenceUpdate('paused', remoteJid);


        if (replyText) {
            // Check for AI Handoff trigger
            // Detect BOTH: [HANDOFF] keyword OR the Arabic transfer message the AI writes directly
            const isHandoffTrigger = replyText.includes('[HANDOFF]') || 
                                     replyText.includes('سأقوم بتحويلك') ||
                                     replyText.includes('ساقوم بتحويلك') ||
                                     replyText.includes('هحولك لمسئول') ||
                                     replyText.includes('هحولك لـ') ||
                                     replyText.includes('تحويلك لأحد') ||
                                     replyText.includes('تحويلك لاحد');
            
            if (isHandoffTrigger) {
                console.log(`[AI Handoff] ✅ HANDOFF DETECTED! Reply: "${replyText.substring(0,100)}"`);
                
                // 1. Mark conversation as handoff (bot stops replying)
                await Conversation.update({ is_handoff: true }, { where: { UserId: userId, remoteJid } });
                console.log(`[AI Handoff] ✅ Conversation ${remoteJid} marked as handoff (bot paused).`);
                
                // 2. Send message to customer
                const handoffMsg = 'عفواً، سأقوم بتحويلك لأحد ممثلي خدمة العملاء. يرجى الانتظار.';
                await sock.sendMessage(remoteJid, { text: handoffMsg });
                const sv = await Message.create({ UserId: userId, remoteJid, role: 'model', content: handoffMsg });
                io.to('user_' + userId).emit('new_message', sv);

                // 3. Notify Control Group (لينا / Lina)
                try {
                    const userObj = await User.findByPk(userId);
                    const customerName = conversation ? (conversation.customerName || remoteJid.split('@')[0]) : remoteJid.split('@')[0];
                    const customerPhone = remoteJid.split('@')[0];
                    const notifyMsg = `🚨 *طلب تدخل بشري (تحويل تلقائي)*\n\n👤 العميل: ${customerName}\n📞 الرقم: ${customerPhone}\n📱 المنصة: واتساب\n\nيرجى الرد مباشرة على العميل أو التوجه للوحة التحكم.`;
                    
                    let targetJid = userObj ? userObj.control_group_jid : null;
                    console.log(`[AI Handoff] Saved control_group_jid: ${targetJid}`);

                    // If no control group saved, search by name
                    if (!targetJid) {
                        console.log('[AI Handoff] No saved group, searching for لينا/Lina group...');
                        const groups = await sock.groupFetchAllParticipating();
                        const allGroupNames = Object.values(groups).map(g => g.subject).join(', ');
                        console.log(`[AI Handoff] Available groups: ${allGroupNames}`);
                        
                        for (const groupId in groups) {
                            const group = groups[groupId];
                            if (group.subject && (group.subject.includes('لينا') || group.subject.toLowerCase().includes('lina'))) {
                                targetJid = groupId;
                                console.log(`[AI Handoff] ✅ Found group: ${group.subject} (${groupId})`);
                                if (userObj) {
                                    userObj.control_group_jid = groupId;
                                    await userObj.save();
                                    console.log(`[AI Handoff] ✅ Saved group JID to DB: ${groupId}`);
                                }
                                break;
                            }
                        }
                    }

                    if (targetJid) {
                        await sock.sendMessage(targetJid, { text: notifyMsg });
                        console.log(`[AI Handoff] ✅ Notification sent to group ${targetJid}`);
                    } else {
                        console.log('[AI Handoff] ❌ No group named لينا/Lina found! Check group name.');
                    }
                } catch (e) {
                    console.error('[AI Handoff] ❌ Failed to notify control group:', e);
                }

                return;
            }
            // FIX: Clean up Markdown links [text](url) -> url (if text is similar) to prevent duplication in WhatsApp
            replyText = replyText.replace(/\[([^\]]*?)\]\(([^)]+?)\)/g, (match, text, url) => {
                const cleanText = text.trim();
                const cleanUrl = url.trim();
                // If text is same as URL or URL contains text (typical AI behavior for raw links), just show URL
                if (cleanText === cleanUrl || cleanUrl.includes(cleanText)) {
                    return cleanUrl;
                }
                // Otherwise show: Text (URL)
                return `${cleanText}: ${cleanUrl}`;
            });

            await sock.sendMessage(remoteJid, { text: replyText });

            const savedResponse = await Message.create({
                UserId: userId,
                remoteJid,
                role: 'model',
                content: replyText
            });
            io.to(`user_${userId}`).emit('new_message', savedResponse);

            // 4. Send image if mentioned in reply
            // Regex to match "image", "his image", "the image", "images", "picture" in Arabic
            const imageRegex = /(╪╡┘ê╪▒╪⌐|╪╡┘ê╪▒╪¬┘ç|╪º┘ä╪╡┘ê╪▒╪⌐|╪º┘ä╪╡┘ê╪▒|╪╡┘ê╪▒|╪╡┘ê╪▒┘ç|╪╡┘ê╪▒╪¬╪⌐)/;

            if (imageRegex.test(replyText)) {
                console.log("\n--- [V6_SIGNATURE] IMAGE SCAN START ---");
                console.log(`≡ƒñû AI Intent: Image`);
                console.log(`≡ƒæñ User: "${text}"`);
                console.log(`≡ƒñû Reply: "${replyText}"`);

                const instructions = await Instruction.findAll({
                    where: { UserId: userId },
                    order: [['order', 'ASC'], ['createdAt', 'DESC']]
                });

                console.log(`≡ƒôÜ Instructions found: ${instructions.length}`);

                let imagesToSend = [];
                const normalize = (t) => t ? t.trim().toLowerCase().replace(/[^\w\s\u0621-\u064A]/g, '') : "";

                const normReply = normalize(replyText);
                const normUser = normalize(text);

                for (const inst of instructions) {
                    if (!inst.imageUrl) continue;

                    const instName = inst.clientName.trim();
                    const normName = normalize(instName);
                    const normContent = normalize(inst.content);

                    console.log(`   ≡ƒöÄ Checking: "${instName}"`);

                    let images = [];
                    try {
                        if (inst.imageUrl.startsWith('[')) images = JSON.parse(inst.imageUrl);
                        else images = [{ url: inst.imageUrl, description: '╪º┘ä╪╡┘ê╪▒╪⌐ ╪º┘ä╪ú╪│╪º╪│┘è╪⌐' }];
                    } catch (e) {
                        images = [{ url: inst.imageUrl, description: '╪º┘ä╪╡┘ê╪▒╪⌐ ╪º┘ä╪ú╪│╪º╪│┘è╪⌐' }];
                    }

                    let found = false;

                    // Match logic
                    const keywords = normName.split(/\s+/).filter(k => k.length > 2);
                    const kMatch = keywords.some(k => normReply.includes(k) || normUser.includes(k));
                    const cMatch = normUser.length > 4 && normContent.includes(normUser);
                    const nMatch = normReply.includes(normName) || normUser.includes(normName);

                    if (kMatch || cMatch || nMatch) {
                        console.log(`      Γ£à MATCH FOUND for "${instName}"`);

                        // Check for specific image description matches
                        const specificMatches = images.filter(img => {
                            const normDesc = normalize(img.description);
                            // Check if description is present in user text or AI reply
                            return normDesc && normDesc.length > 1 && (normUser.includes(normDesc) || normReply.includes(normDesc));
                        });

                        if (specificMatches.length > 0) {
                            console.log(`      ≡ƒÄ» Specific description matches found: ${specificMatches.length}`);
                            specificMatches.forEach(img => {
                                imagesToSend.push({
                                    url: img.url,
                                    caption: img.description ? `≡ƒô╖ ${instName} - ${img.description}` : `≡ƒô╖ ${instName}`
                                });
                            });
                        } else {
                            // Fallback: Send all images if no specific description is mentioned
                            console.log(`      Running fallback: Sending all images for ${instName}`);
                            images.forEach(img => {
                                imagesToSend.push({
                                    url: img.url,
                                    caption: img.description ? `≡ƒô╖ ${instName} - ${img.description}` : `≡ƒô╖ ${instName}`
                                });
                            });
                        }
                        found = true;
                    }

                    if (!found) {
                        for (const img of images) {
                            const normDesc = normalize(img.description);
                            if (normDesc && normDesc.length > 1 && normReply.includes(normDesc)) {
                                console.log(`      Γ£à MATCH FOUND via description: "${img.description}"`);
                                imagesToSend.push({ url: img.url, caption: `≡ƒô╖ ${instName} - ${img.description}` });
                                found = true;
                            }
                        }
                    }
                }

                if (imagesToSend.length === 0) {
                    const instsWithImages = instructions.filter(i => i.imageUrl);
                    if (instsWithImages.length === 1) {
                        const inst = instsWithImages[0];
                        console.log(`   ΓÜá∩╕Å FALLBACK: Sending images from "${inst.clientName}"`);
                        let images = [];
                        try {
                            if (inst.imageUrl.startsWith('[')) images = JSON.parse(inst.imageUrl);
                            else images = [{ url: inst.imageUrl }];
                        } catch (e) { images = [{ url: inst.imageUrl }]; }

                        images.forEach(img => {
                            imagesToSend.push({
                                url: img.url,
                                caption: img.description ? `≡ƒô╖ ${inst.clientName.trim()} - ${img.description}` : `≡ƒô╖ ${inst.clientName.trim()}`
                            });
                        });
                    }
                }

                if (imagesToSend.length > 0) {
                    const unique = [...new Map(imagesToSend.map(item => [item.url, item])).values()];
                    console.log(`≡ƒÜÇ RESULT: Sending ${unique.length} images.`);

                    for (const imgObj of unique) {
                        try {
                            const imagePath = path.join(process.cwd(), 'public', imgObj.url);
                            if (fs.existsSync(imagePath)) {
                                await sock.sendMessage(remoteJid, {
                                    image: { url: imagePath },
                                    caption: imgObj.caption
                                });
                                console.log(`   Γ£à Sent: ${imgObj.url}`);
                            } else {
                                console.log(`   Γ¥î ERROR: File missing: ${imagePath}`);
                            }
                        } catch (err) {
                            console.error(`   Γ¥î FAIL: ${err.message}`);
                        }
                    }
                } else {
                    console.log("Γ¥î RESULT: No matches found.");
                }
                console.log("--- [V6_SIGNATURE] IMAGE SCAN END ---\n");
            }

            // 5. Check if order is complete and send to group
            if (replyText.includes("╪¬┘à ╪Ñ╪▒╪│╪º┘ä ╪╖┘ä╪¿┘â ╪¿┘å╪¼╪º╪¡") && replyText.includes("╪▒┘é┘à ╪º┘ä╪╖┘ä╪¿:")) {
                console.log("Γ£à Order completed! Preparing to forward to group...");
                await handleOrderCompletion(sock, remoteJid, text, replyText, userId);
            }
        }
    });

    return { status: 'started' };
};

export const stopSession = async (userId, io) => {
    // DISABLE Auto Reply in DB, but KEEP socket connection AND update status
    await User.update({ auto_reply: false, connection_status: 'paused' }, { where: { id: userId } });

    // Emit paused status
    if (io) io.to(`user_${userId}`).emit('status', { status: 'paused' });

    if (sessions.has(userId)) {
        return { status: 'paused', message: 'Bot Auto-Reply Paused' };
    }

    return { status: 'offline', message: 'Bot is offline' };
};

export const logoutSession = async (userId, io) => {
    console.log(`Logout requested for user ${userId}`);
    try {
        await User.update({ auto_reply: false, linked_phone_number: null, connection_status: 'not_registered' }, { where: { id: userId } });

        if (sessions.has(userId)) {
            const sock = sessions.get(userId);

            // Remove listeners to prevent auto-reconnect logic from firing
            sock.ev.removeAllListeners('connection.update');

            try {
                sock.end(undefined);
            } catch (e) {
                console.error("Error closing socket:", e);
            }
            sessions.delete(userId);
        }

        // Wait a bit to ensure file locks are released on Windows
        await new Promise(resolve => setTimeout(resolve, 1000));

        const authPath = path.join('sessions', `auth_info_${userId}`);
        if (fs.existsSync(authPath)) {
            try {
                fs.rmSync(authPath, { recursive: true, force: true });
            } catch (fsErr) {
                console.error(`Failed to delete session files for ${userId}:`, fsErr);
            }
        }

        if (io) io.to(`user_${userId}`).emit('status', { status: 'not_registered' });
        console.log(`User ${userId} logged out and session deleted.`);
        return { status: 'not_registered', message: 'Session Deleted' };
    } catch (error) {
        console.error("Logout Error:", error);
        return { status: 'error', message: error.message };
    }
};


export const restoreSessions = async (io) => {
    console.log("≡ƒöä Restoring sessions...");
    try {
        const users = await User.findAll({ where: { auto_reply: true } });
        for (const user of users) {
            const authPath = path.join('sessions', `auth_info_${user.id}`);
            if (fs.existsSync(authPath)) {
                console.log(`ΓÖ╗∩╕Å Restoring session for user ${user.id}`);
                await startSession(user.id, io);
            } else {
                console.log(`ΓÜá∩╕Å Session files missing for user ${user.id}, disabling auto_reply.`);
                user.auto_reply = false;
                user.connection_status = 'offline';
                await user.save();
            }
        }
    } catch (error) {
        console.error("Γ¥î Error restoring sessions:", error);
    }
};

export const getStatus = async (userId) => {
    try {
        const user = await User.findByPk(userId);

        // 1. Check active session (Real-time connection)
        if (sessions.has(userId)) {
            const sock = sessions.get(userId);

            if (sock.user) {
                const id = sock.user.id.split(':')[0].split('@')[0];
                const name = sock.user.name || "My Bot";

                // Update DB just in case
                if (user.linked_phone_number !== id) {
                    await User.update({ linked_phone_number: id }, { where: { id: userId } });
                }

                // Check for Manual Pause (Highest Priority)
                if (user.connection_status === 'paused_manual') {
                    return { status: 'paused_manual', phone: id, name: name, pause_until: user.pause_until };
                }

                // If auto_reply is disabled, return PAUSED
                if (!user.auto_reply) {
                    return { status: 'paused', phone: id, name: name };
                }

                return { status: 'online', phone: id, name: name };
            }
            return { status: 'connecting' };
        }

        // 2. Check DB for previous connection (Offline but Registered)
        if (user && user.linked_phone_number) {
            // Return the stored status if available, else offline
            return {
                status: user.connection_status || 'offline',
                phone: user.linked_phone_number,
                pause_until: user.pause_until
            };
        }

        // 3. No session and no history (Not Registered)
        return { status: 'not_registered' };

    } catch (error) {
        console.error("Error checking user status:", error);
        return { status: 'offline' };
    }
};



export const getGroups = async (userId, page = 1, limit = 10) => {
    const sock = sessions.get(userId);
    if (!sock || !sock.user) {
        return [];
    }

    try {
        // 1. Fetch all groups metadata from Baileys (Cached)
        const groupsPromise = sock.groupFetchAllParticipating();
        // user timeout
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({}), 3000));
        const result = await Promise.race([groupsPromise, timeoutPromise]);

        if (!result || Object.keys(result).length === 0) {
            return [];
        }

        let allGroups = Object.values(result);

        // 2. Fetch last activity time from DB for these groups
        // We want to sort by the most recent message sent/received in the group
        const groupJids = allGroups.map(g => g.id);

        const recentMessages = await Message.findAll({
            attributes: [
                'remoteJid',
                [Sequelize.fn('MAX', Sequelize.col('createdAt')), 'lastActivity']
            ],
            where: {
                remoteJid: {
                    [Op.in]: groupJids
                },
                UserId: userId
            },
            group: ['remoteJid'],
            raw: true
        });

        // Create a map for quick lookup: JID -> Timestamp
        const activityMap = new Map();
        recentMessages.forEach(msg => {
            activityMap.set(msg.remoteJid, new Date(msg.lastActivity).getTime());
        });

        // 3. Sort groups: Active first, then by Creation date
        allGroups.sort((a, b) => {
            const timeA = activityMap.get(a.id) || 0;
            const timeB = activityMap.get(b.id) || 0;

            if (timeA !== timeB) {
                return timeB - timeA; // Descending (newest activity first)
            }
            return (b.creation || 0) - (a.creation || 0); // Fallback to creation date
        });

        // 4. Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedGroups = allGroups.slice(startIndex, endIndex);

        return paginatedGroups.map(g => ({
            id: g.id,
            subject: g.subject
        }));

    } catch (error) {
        console.error("Error fetching groups:", error);
        return [];
    }
};

export const checkSubscriptionExpiry = async (io) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        console.log(`[Subscription Check] Checking for expired users before: ${today}`);

        const expiredUsers = await User.findAll({
            where: {
                is_active: true,
                expiry_date: {
                    [Op.ne]: null,
                    [Op.lt]: today
                },
                role: { [Op.ne]: 'super_admin' }
            }
        });

        if (expiredUsers.length > 0) {
            console.log(`[Subscription Check] Found ${expiredUsers.length} expired users.`);

            for (const user of expiredUsers) {
                console.log(`[Subscription Check] Suspending User: ${user.username} (ID: ${user.id})`);

                user.is_active = false;
                user.auto_reply = false;
                user.connection_status = 'paused';
                await user.save();

                // Emit status update to dashboard
                if (io) {
                    io.to(`user_${user.id}`).emit('status', { status: 'paused' });
                }

                try {
                    await stopSession(user.id, io);
                } catch (err) {
                    console.error(`[Subscription Check] Error stopping session for user ${user.id}:`, err);
                }
            }
        }
    } catch (error) {
        console.error("[Subscription Check] Error:", error);
    }
};

export const checkPauseTimer = async (io) => {
    try {
        const now = new Date();
        const pausedUsers = await User.findAll({
            where: {
                connection_status: 'paused_manual',
                pause_until: {
                    [Op.ne]: null,
                    [Op.lt]: now
                }
            }
        });

        if (pausedUsers.length > 0) {
            console.log(`[Pause Timer] Found ${pausedUsers.length} users to resume.`);

            for (const user of pausedUsers) {
                console.log(`[Pause Timer] Resuming User: ${user.username} (ID: ${user.id})`);

                user.connection_status = 'online';
                user.pause_until = null;
                await user.save();

                // Notify in Control Group if exists
                if (user.control_group_jid) {
                    try {
                        const sock = sessions.get(user.id);
                        if (sock) {
                            await sock.sendMessage(user.control_group_jid, { text: 'Γ£à ╪º┘å╪¬┘ç╪¬ ┘à╪»╪⌐ ╪º┘ä╪º┘å╪¬╪╕╪º╪▒. ╪¬┘à ╪º╪│╪¬╪ª┘å╪º┘ü ╪º┘ä╪▒╪» ╪º┘ä╪¬┘ä┘é╪º╪ª┘è.' });
                        }
                    } catch (err) {
                        console.error(`[Pause Timer] Error sending resume notification for user ${user.id}:`, err);
                    }
                }
            }
        }
    } catch (error) {
        console.error("[Pause Timer] Error:", error);
    }
};

// ============================================================
// ⏱️ Inactivity Summary: بعد 15 دقيقة سكوت → بعت ملخص للجروب
// ============================================================
export const checkInactivitySummary = async () => {
    try {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

        // جيب كل المحادثات النشطة اللي آخر رسالة أتبعتت من أكتر من 15 دقيقة
        // وملخصها لسه مش اتبعت (summary_sent = false)
        const staleConversations = await Conversation.findAll({
            where: {
                lastMessageAt: { [Op.lt]: fifteenMinutesAgo },
                summary_sent: false,
                platform: 'whatsapp'
            },
            include: [{ model: User, as: 'User', attributes: ['id', 'control_group_jid', 'inactivity_summary'] }]
        });

        for (const conv of staleConversations) {
            const user = conv.User;
            if (!user || !user.inactivity_summary || !user.control_group_jid) continue;

            const sock = sessions.get(user.id);
            if (!sock) continue;

            try {
                // جيب آخر 20 رسالة في المحادثة دي
                const messages = await Message.findAll({
                    where: { UserId: user.id, remoteJid: conv.remoteJid },
                    order: [['createdAt', 'DESC']],
                    limit: 20,
                    attributes: ['role', 'content', 'createdAt']
                });

                if (messages.length === 0) {
                    await Conversation.update({ summary_sent: true }, { where: { id: conv.id } });
                    continue;
                }

                // رتّب الرسايل من الأقدم للأحدث
                const orderedMsgs = messages.reverse();
                const chatLog = orderedMsgs.map(m => {
                    const roleLabel = m.role === 'user' ? '👤 عميل' : '🤖 بوت';
                    const content = m.content?.substring(0, 200) || '';
                    return `${roleLabel}: ${content}`;
                }).join('\n');

                const summaryMsg = `📋 *ملخص محادثة منتهية (لا رد منذ 15 دقيقة)*\n\n👤 العميل: ${conv.customerName || conv.remoteJid.split('@')[0]}\n📱 المنصة: واتساب\n🕐 آخر رسالة: ${conv.lastMessageAt?.toLocaleTimeString('ar-EG') || '-'}\n\n─────────────────\n${chatLog}\n─────────────────\n\nيرجى المتابعة مع العميل إذا لزم الأمر.`;

                await sock.sendMessage(user.control_group_jid, { text: summaryMsg });
                await Conversation.update({ summary_sent: true }, { where: { id: conv.id } });

                console.log(`[InactivitySummary] Sent summary for ${conv.remoteJid} (User: ${user.id})`);
            } catch (err) {
                console.error(`[InactivitySummary] Error for conv ${conv.id}:`, err.message);
            }
        }
    } catch (error) {
        console.error('[InactivitySummary] Error:', error);
    }
};

export async function simulateChat(userId, userText) {
    const user = await User.findByPk(userId);
    const allInstructions = await Instruction.findAll({
        where: { UserId: userId, isActive: true },
        order: [['order', 'ASC'], ['createdAt', 'DESC']]
    });

    let filteredInstructions = [];
    let loadedTopics = [];

    const dbMessages = await SimulationMessage.findAll({
        where: { UserId: userId },
        limit: 10,
        order: [['createdAt', 'DESC']]
    });

    const normalizeText = (text) => {
        if (!text) return "";
        let t = text.toLowerCase().trim();
        t = t.replace(/[╪ú╪Ñ╪ó]/g, '╪º');
        t = t.replace(/╪⌐/g, '┘ç');
        return t;
    };
    
    const recentHistoryText = dbMessages.slice(0, 4).map(m => m.content).join(" ");
    const combinedQuery = normalizeText(userText + " " + recentHistoryText);

    if (allInstructions.length > 0) {
        filteredInstructions = allInstructions.filter(inst => {
            if (inst.type === 'global') return true;

            if (inst.keywords) {
                const keywords = inst.keywords.split(',').map(k => normalizeText(k));
                const isRelevant = keywords.some(k => k.length >= 2 && combinedQuery.includes(k));

                if (isRelevant) {
                    loadedTopics.push(inst.clientName);
                    return true;
                }
            }
            return false;
        });
    }

    let systemInstruction = CONFIG.SYSTEM_INSTRUCTIONS;
    if (filteredInstructions.length > 0) {
        systemInstruction += '\n\n≡ƒ¢æ **╪¬╪╣┘ä┘è┘à╪º╪¬ ╪╡╪º╪▒┘à╪⌐ (┘è╪¼╪¿ ╪º┘ä╪º┘ä╪¬╪▓╪º┘à ╪¿┘ç╪º ╪¡╪▒┘ü┘è╪º┘ï ┘ê╪¬╪¼╪º┘ç┘ä ╪ú┘è ╪│┘è╪º┘é ╪ú┘ê ╪┤╪«╪╡┘è╪⌐ ╪ú╪«╪▒┘ë ╪¬╪¬╪╣╪º╪▒╪╢ ┘à╪╣┘ç╪º):**\n\n' + filteredInstructions.map(inst => inst.content).join('\n\n');
    }

    systemInstruction += '\n\n≡ƒÆí **┘à┘ä╪º╪¡╪╕╪⌐ ┘ä┘â ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è:** ╪ú┘å╪¬ ╪º┘ä╪ó┘å ┘ü┘è ┘ê╪╢╪╣ ╪º┘ä┘à╪¡╪º┘â╪º╪⌐ ┘ê╪º┘ä╪¬╪»╪▒┘è╪¿ ╪º┘ä╪»╪º╪«┘ä┘è. ╪¼╪º┘ê╪¿ ╪¿┘å╪º╪í┘ï ╪╣┘ä┘ë ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ┘ü┘é╪╖ ┘ê╪¬╪¼╪º┘ç┘ä ╪ú┘è ╪¬┘ä╪º╪╣╪¿ ┘ü┘è ╪º┘ä╪┤╪º╪¬ ╪º┘ä╪│╪¼┘ä ┘è╪╣╪º╪▒╪╢ ┘ç╪░┘ç ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬.';

    const history = dbMessages.reverse().map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
    }));

    history.push({ role: "user", parts: [{ text: userText }] });

    const contents = history;
    const location = 'us-central1';
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/${location}/publishers/google/models/${CONFIG.MODEL_NAME}:generateContent`;

    const payload = {
        contents: contents,
        system_instruction: {
            parts: [{ text: systemInstruction }]
        },
        generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            topK: 20
        }
    };

    try {
        const auth = new GoogleAuth({
            keyFilename: CONFIG.GOOGLE_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'trim-bot-486500-h8-4b614b18f7c0.json',
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });

        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken.token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Vertex AI Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        let reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

        let totalTokens = data.usageMetadata?.totalTokenCount || 0;
        
        if (user && totalTokens > 0) {
            await user.increment('total_tokens', { by: totalTokens });
        }

        if (reply) {
            const imageRegex = /(صورة|صورته|الصورة|الصور|صور|صوره|صورة|اراء|آراء|تقييم|ريفيو)/;
            if (imageRegex.test(reply)) {
                let imagesCount = 0;
                for (const inst of filteredInstructions) {
                    if (inst.imageUrl) {
                        try {
                            if (inst.imageUrl.startsWith('[')) {
                                imagesCount += JSON.parse(inst.imageUrl).length;
                            } else {
                                imagesCount += 1;
                            }
                        } catch(e) {}
                    }
                }
                if (imagesCount > 0) {
                    reply += `\n\n📸 [توضيح للمدير: سيقوم البوت هنا بإرسال (${imagesCount}) صورة للعميل تلقائياً على الواتساب/الماسنجر]`;
                }
            }
        }

        return reply || null;
    } catch (error) {
        console.error("AI Simulation Failed:", error);
        return "╪╣╪░╪▒╪º┘ï╪î ╪¡╪»╪½ ╪«╪╖╪ú ╪ú╪½┘å╪º╪í ╪º┘ä┘à╪¡╪º┘â╪º╪⌐.";
    }
}

// ============================================================
// ≡ƒ¢í∩╕Å Conflict Detection Helper
// ┘è┘â╪┤┘ü ╪º┘ä╪¬╪╣╪º╪▒╪╢ ┘ü┘è ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ╪¿┘è┘å ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä┘à┘ê╪¼┘ê╪»╪⌐ ┘ê╪º┘ä╪¼╪»┘è╪»╪⌐
// ============================================================
async function detectKeywordConflicts(userId, newKeywords, excludeId = null) {
    const normalizeKw = (kw) => kw.toLowerCase().trim();
    const newKwList = newKeywords.split(',').map(k => normalizeKw(k)).filter(k => k.length > 2);
    if (newKwList.length === 0) return [];

    const whereClause = { UserId: userId, isActive: true };
    if (excludeId) whereClause.id = { [Op.ne]: excludeId };

    const existingInstructions = await Instruction.findAll({ where: whereClause });

    const conflicts = [];
    for (const inst of existingInstructions) {
        if (!inst.keywords) continue;
        const existingKwList = inst.keywords.split(',').map(k => normalizeKw(k)).filter(k => k.length > 2);
        const overlapping = newKwList.filter(k => existingKwList.includes(k));
        if (overlapping.length > 0) {
            conflicts.push({
                id: inst.id,
                clientName: inst.clientName,
                overlappingKeywords: overlapping
            });
        }
    }
    return conflicts;
}

export async function teachBot(userId, userText) {
    try {
        const user = await User.findByPk(userId);
        
        // System instruction specific to teaching
        const systemInstruction = `╪ú┘å╪¬ ┘à╪│╪º╪╣╪» ╪░┘â╪º╪í ╪º╪╡╪╖┘å╪º╪╣┘è ┘à╪¬╪«╪╡╪╡ ┘ü┘è ╪Ñ╪»╪º╪▒╪⌐ ╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä╪¿┘ê╪¬. ┘à┘ç┘à╪¬┘â ╪º┘ä╪ú╪│╪º╪│┘è╪⌐:

1. **╪╣┘å╪» ╪╖┘ä╪¿ ╪╣╪▒╪╢ ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬**: ╪º╪│╪¬╪«╪»┘à 'list_all_instructions' ╪╣┘ä┘ë ╪º┘ä┘ü┘ê╪▒ ┘ä╪¼┘ä╪¿ ╪º┘ä┘â┘ä.
2. **╪╣┘å╪» ╪╖┘ä╪¿ ┘â╪┤┘ü ╪º┘ä╪¬╪╣╪º╪▒╪╢╪º╪¬**: ╪º╪│╪¬╪«╪»┘à 'analyze_conflicts' ┘ä╪¬╪¡┘ä┘è┘ä ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ╪º┘ä┘à╪¬┘â╪▒╪▒╪⌐ ┘ê╪¬┘é╪»┘è┘à ┘à┘é╪¬╪▒╪¡╪º╪¬ ╪¬╪╣╪»┘è┘ä ┘à╪¡╪»╪»╪⌐.
3. **╪╣┘å╪» ╪Ñ╪╢╪º┘ü╪⌐ ╪¬╪╣┘ä┘è┘à╪⌐ ╪¼╪»┘è╪»╪⌐**: ╪º╪│╪¬┘å╪¬╪¼ ╪º┘ä╪╣┘å┘ê╪º┘å ┘ê╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ┘ê╪º┘ä┘à╪¡╪¬┘ê┘ë ╪¬┘ä┘é╪º╪ª┘è╪º┘ï ┘ê╪º╪│╪¬╪«╪»┘à 'save_instruction'.
4. **╪╣┘å╪» ╪╖┘ä╪¿ ╪¬╪╣╪»┘è┘ä**: ╪º╪│╪¬╪«╪»┘à 'update_instruction' ┘à╪¿╪º╪┤╪▒╪⌐ ╪¿╪»┘ê┘å ┘å┘é╪º╪┤.
5. **╪╣┘å╪» ╪º┘ä╪¿╪¡╪½**: ╪º╪│╪¬╪«╪»┘à 'search_instructions'.

┘é┘ê╪º╪╣╪» ╪░┘ç╪¿┘è╪⌐:
- ┘ä╪º ╪¬╪│╪ú┘ä ╪º┘ä┘à╪│╪¬╪«╪»┘à ╪╣┘å ╪ú┘è ╪¬┘ü╪º╪╡┘è┘ä. ╪º╪│╪¬┘å╪¬╪¼┘ç╪º ╪¿┘å┘ü╪│┘â.
- ╪╣┘å╪» ╪º┘é╪¬╪▒╪º╪¡ ╪¬╪╣╪»┘è┘ä╪º╪¬ ┘ä╪¡┘ä ╪º┘ä╪¬╪╣╪º╪▒╪╢╪º╪¬╪î ┘é╪»┘æ┘à ╪º┘ä┘à┘é╪¬╪▒╪¡ ╪¿╪┤┘â┘ä ┘ê╪º╪╢╪¡ ┘à╪╣ ╪▒┘é┘à ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ┘ê╪º┘ä╪¬╪╣╪»┘è┘ä ╪º┘ä┘à┘é╪¬╪▒╪¡ ╪½┘à ┘é┘ä "┘ç┘ä ╪¬╪▒┘è╪» ╪¬╪╖╪¿┘è┘é ┘ç╪░╪º ╪º┘ä╪¬╪╣╪»┘è┘ä╪ƒ" ┘ê╪º┘å╪¬╪╕╪▒ ┘à┘ê╪º┘ü┘é╪¬┘ç.
- ╪╣┘å╪» ╪º┘ä┘à┘ê╪º┘ü┘é╪⌐ ╪╣┘ä┘ë ┘à┘é╪¬╪▒╪¡╪î ┘å┘ü╪░┘ç ┘ü┘ê╪▒╪º┘ï ╪¿╪º╪│╪¬╪«╪»╪º┘à 'update_instruction'.
- ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ╪¬┘â┘ê┘å ┘à┘ü╪╡┘ê┘ä╪⌐ ╪¿┘ü╪º╪╡┘ä╪⌐ (┘à╪½╪º┘ä: "╪ú╪│╪╣╪º╪▒, ╪¿╪º┘é╪º╪¬, ╪¬┘â┘ä┘ü╪⌐").
- ╪Ñ╪░╪º ╪╖┘Å┘ä╪¿ ┘à┘å┘â ╪╣╪▒╪╢ ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬╪î ╪º╪╣╪▒╪╢┘ç╪º ╪¿╪┤┘â┘ä ┘à┘å╪╕┘à ┘à╪╣ ╪º┘ä┘Ç ID ┘ê╪º┘ä╪╣┘å┘ê╪º┘å ┘ê╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐.`;

        const dbMessages = await TeachMessage.findAll({
            where: { UserId: userId },
            limit: 15,
            order: [['createdAt', 'DESC']]
        });

        const history = dbMessages.reverse().map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user', // Vertex AI uses 'user' and 'model'
            parts: [{ text: msg.content }]
        }));

        history.push({ role: "user", parts: [{ text: userText }] });

        const location = 'us-central1';
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/${location}/publishers/google/models/${CONFIG.MODEL_NAME}:generateContent`;

        const payload = {
            contents: history,
            system_instruction: {
                parts: [{ text: systemInstruction }]
            },
            tools: [
                {
                    function_declarations: [
                        {
                            name: "save_instruction",
                            description: "╪Ñ╪╢╪º┘ü╪⌐ ╪¬╪╣┘ä┘è┘à╪º╪¬ ╪¼╪»┘è╪»╪⌐ ┘ä┘ä╪¿┘ê╪¬",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    clientName: { type: "STRING", description: "╪╣┘å┘ê╪º┘å ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐" },
                                    keywords: { type: "STRING", description: "╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ┘à┘ü╪╡┘ê┘ä╪⌐ ╪¿┘ü╪º╪╡┘ä╪⌐ (5 ╪╣┘ä┘ë ╪º┘ä╪ú┘é┘ä)" },
                                    content: { type: "STRING", description: "┘à╪¡╪¬┘ê┘ë ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐" }
                                },
                                required: ["clientName", "keywords", "content"]
                            }
                        },
                        {
                            name: "update_instruction",
                            description: "╪¬╪╣╪»┘è┘ä ╪¬╪╣┘ä┘è┘à╪⌐ ┘à┘ê╪¼┘ê╪»╪⌐ ╪¿╪º┘ä┘Ç ID",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    id: { type: "INTEGER", description: "╪▒┘é┘à ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ (ID)" },
                                    clientName: { type: "STRING", description: "╪º┘ä╪╣┘å┘ê╪º┘å ╪º┘ä╪¼╪»┘è╪» (╪º╪«╪¬┘è╪º╪▒┘è)" },
                                    keywords: { type: "STRING", description: "╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ╪º┘ä╪¼╪»┘è╪»╪⌐ (╪º╪«╪¬┘è╪º╪▒┘è)" },
                                    content: { type: "STRING", description: "╪º┘ä┘à╪¡╪¬┘ê┘ë ╪º┘ä╪¼╪»┘è╪»" }
                                },
                                required: ["id", "content"]
                            }
                        },
                        {
                            name: "search_instructions",
                            description: "╪º┘ä╪¿╪¡╪½ ┘ü┘è ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ╪¿┘â┘ä┘à╪⌐ ┘à╪╣┘è┘å╪⌐",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    query: { type: "STRING", description: "┘â┘ä┘à╪⌐ ╪º┘ä╪¿╪¡╪½" }
                                },
                                required: ["query"]
                            }
                        },
                        {
                            name: "list_all_instructions",
                            description: "╪¼┘ä╪¿ ┘â┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä┘à╪¡┘ü┘ê╪╕╪⌐ ┘ê╪╣╪▒╪╢┘ç╪º ┘à╪╣ ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ┘ê╪º┘ä┘Ç ID ┘ä┘â┘ä ┘à┘å┘ç╪º",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    show_keywords: { type: "BOOLEAN", description: "╪╣╪▒╪╢ ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ┘à╪╣ ┘â┘ä ╪¬╪╣┘ä┘è┘à╪⌐" }
                                },
                                required: []
                            }
                        },
                        {
                            name: "analyze_conflicts",
                            description: "╪¬╪¡┘ä┘è┘ä ┘â┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ┘ê╪º┘â╪¬╪┤╪º┘ü ╪º┘ä╪¬╪╣╪º╪▒╪╢╪º╪¬ ┘ü┘è ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ┘ê╪¬┘é╪»┘è┘à ┘à┘é╪¬╪▒╪¡╪º╪¬ ┘ä╪¡┘ä┘ç╪º",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    auto_suggest: { type: "BOOLEAN", description: "╪¬┘é╪»┘è┘à ┘à┘é╪¬╪▒╪¡╪º╪¬ ╪¬┘ä┘é╪º╪ª┘è╪⌐ ┘ä╪¡┘ä ╪º┘ä╪¬╪╣╪º╪▒╪╢╪º╪¬" }
                                },
                                required: []
                            }
                        }
                    ]
                }
            ]
        };

        const auth = new GoogleAuth({
            keyFilename: CONFIG.GOOGLE_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'trim-bot-486500-h8-4b614b18f7c0.json',
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });

        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken.token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Vertex AI Error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const part = data.candidates?.[0]?.content?.parts?.[0];

        // 1. Check for Function Call
        if (part?.functionCall) {
            const fnName = part.functionCall.name;
            const args = part.functionCall.args;

            if (fnName === 'save_instruction') {
                // ============================================
                // ≡ƒöì ╪º┘ä┘à┘é╪¬╪▒╪¡ 1: ╪¬╪¡┘é┘é ┘à┘å ╪º┘ä╪¬┘â╪▒╪º╪▒ ┘é╪¿┘ä ╪º┘ä╪¡┘ü╪╕
                // ============================================
                const existingByName = await Instruction.findOne({
                    where: {
                        UserId: userId,
                        clientName: { [Op.like]: `%${args.clientName}%` }
                    }
                });

                if (existingByName) {
                    return `ΓÜá∩╕Å **╪¬┘å╪¿┘è┘ç:** ┘è┘ê╪¼╪» ╪¿╪º┘ä┘ü╪╣┘ä ╪¬╪╣┘ä┘è┘à╪⌐ ┘à╪┤╪º╪¿┘ç╪⌐ ╪¿┘å┘ü╪│ ╪º┘ä╪º╪│┘à!\n\n≡ƒôî ID: ${existingByName.id} | ╪º┘ä╪º╪│┘à: "${existingByName.clientName}"\n╪º┘ä┘à╪¡╪¬┘ê┘ë: ${existingByName.content.substring(0, 100)}...\n\n┘ç┘ä ╪¬╪▒┘è╪» ╪¬╪╣╪»┘è┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ╪º┘ä┘à┘ê╪¼┘ê╪»╪⌐╪ƒ ┘é┘ä ┘ä┘è: "╪╣╪»┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ╪▒┘é┘à ${existingByName.id} ┘ê╪╢┘è┘ü: [╪º┘ä╪Ñ╪╢╪º┘ü╪⌐]"\n╪ú┘ê ┘é┘ä "╪º╪¡┘ü╪╕┘ç╪º ┘â╪¬╪╣┘ä┘è┘à╪⌐ ┘à┘å┘ü╪╡┘ä╪⌐" ┘ä┘ê ┘â╪º┘å╪¬ ┘à╪«╪¬┘ä┘ü╪⌐ ┘ü╪╣┘ä╪º┘ï.`;
                }

                // ============================================
                // ΓÜö∩╕Å ╪º┘ä┘à┘é╪¬╪▒╪¡ 4: ┘â╪┤┘ü ╪¬╪╣╪º╪▒╪╢ ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐
                // ============================================
                const conflicts = await detectKeywordConflicts(userId, args.keywords || '');

                if (conflicts.length > 0) {
                    // ╪¡┘ü╪╕ ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ╪▒╪║┘à ╪º┘ä╪¬╪╣╪º╪▒╪╢ ┘ä┘â┘å ╪Ñ╪¿┘ä╪º╪║ ╪º┘ä┘à╪│╪¬╪«╪»┘à
                    const newInst = await Instruction.create({
                        clientName: args.clientName,
                        title: args.clientName,
                        content: args.content,
                        actionTarget: '',
                        UserId: userId,
                        keywords: args.keywords,
                        type: 'topic'
                    });

                    const conflictDetails = conflicts.map(c =>
                        `  ≡ƒö┤ ID: ${c.id} | "${c.clientName}" ΓåÆ ┘â┘ä┘à╪º╪¬ ┘à╪┤╪¬╪▒┘â╪⌐: [${c.overlappingKeywords.join(', ')}]`
                    ).join('\n');

                    return `Γ£à ╪¬┘à ╪¡┘ü╪╕ ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ "${args.clientName}" ╪¿┘å╪¼╪º╪¡ (ID: ${newInst.id})\n\n` +
                        `ΓÜö∩╕Å **╪¬╪¡╪░┘è╪▒: ╪¬╪╣╪º╪▒╪╢ ┘ü┘è ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐!**\n` +
                        `╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä╪¬╪º┘ä┘è╪⌐ ╪¬╪¡╪¬┘ê┘è ╪╣┘ä┘ë ┘â┘ä┘à╪º╪¬ ┘à┘ü╪¬╪º╪¡┘è╪⌐ ┘à╪┤╪¬╪▒┘â╪⌐ ┘ê┘é╪» ╪¬╪│╪¿╪¿ ╪▒╪»┘ê╪»╪º┘ï ╪║┘è╪▒ ┘à╪¬┘ê┘é╪╣╪⌐:\n\n${conflictDetails}\n\n` +
                        `≡ƒÆí **┘å╪╡┘è╪¡╪⌐:** ╪º╪│╪¬╪«╪»┘à "╪╣╪»┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ╪▒┘é┘à [ID]" ┘ä╪¬╪║┘è┘è╪▒ ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ╪º┘ä┘à┘â╪▒╪▒╪⌐╪î ╪ú┘ê ╪¬╪ú┘â╪» ╪Ñ┘å ┘â┘ä ╪¬╪╣┘ä┘è┘à╪⌐ ╪╣┘å╪»┘ç╪º ┘â┘ä┘à╪º╪¬ ┘à┘ü╪¬╪º╪¡┘è╪⌐ ┘à╪«╪¬┘ä┘ü╪⌐ ╪¬┘à╪º┘à╪º┘ï.`;
                }

                // ╪¡┘ü╪╕ ╪╣╪º╪»┘è ╪¿╪»┘ê┘å ╪ú┘è ╪¬╪╣╪º╪▒╪╢
                const newInst = await Instruction.create({
                    clientName: args.clientName,
                    title: args.clientName,
                    content: args.content,
                    actionTarget: '',
                    UserId: userId,
                    keywords: args.keywords,
                    type: 'topic'
                });
                return `Γ£à ╪¬┘à ╪¡┘ü╪╕ ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ "${args.clientName}" ╪¿┘å╪¼╪º╪¡! (ID: ${newInst.id})\n\n╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ╪º┘ä┘à╪│╪¼┘ä╪⌐: ${args.keywords}\n\n┘è┘à┘â┘å┘â ╪º┘ä╪ó┘å ╪¬╪¼╪▒╪¿╪¬┘ç╪º ┘ü┘è ╪┤╪º╪¬ ╪º┘ä╪º╪«╪¬╪¿╪º╪▒. ┘ç┘ä ╪¬╪▒┘è╪» ╪Ñ╪╢╪º┘ü╪⌐ ╪┤┘è╪í ╪ó╪«╪▒╪ƒ`;
            } 
            else if (fnName === 'update_instruction') {
                // ============================================
                // ΓÜö∩╕Å ┘â╪┤┘ü ╪º┘ä╪¬╪╣╪º╪▒╪╢ ╪╣┘å╪» ╪º┘ä╪¬╪╣╪»┘è┘ä ╪ú┘è╪╢╪º┘ï
                // ============================================
                if (args.keywords) {
                    const conflicts = await detectKeywordConflicts(userId, args.keywords, args.id);
                    await Instruction.update({
                        clientName: args.clientName,
                        title: args.clientName,
                        content: args.content,
                        keywords: args.keywords
                    }, { where: { id: args.id, UserId: userId } });

                    if (conflicts.length > 0) {
                        const conflictDetails = conflicts.map(c =>
                            `  ≡ƒö┤ ID: ${c.id} | "${c.clientName}" ΓåÆ ┘â┘ä┘à╪º╪¬ ┘à╪┤╪¬╪▒┘â╪⌐: [${c.overlappingKeywords.join(', ')}]`
                        ).join('\n');
                        return `Γ£à ╪¬┘à ╪¬╪╣╪»┘è┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ╪▒┘é┘à ${args.id} ╪¿┘å╪¼╪º╪¡.\n\n` +
                            `ΓÜö∩╕Å **╪¬╪¡╪░┘è╪▒: ┘ä╪º ╪¬╪▓╪º┘ä ┘ç┘å╪º┘â ╪¬╪╣╪º╪▒╪╢╪º╪¬ ┘ü┘è ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐:**\n${conflictDetails}`;
                    }
                    return `Γ£à ╪¬┘à ╪¬╪╣╪»┘è┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ╪▒┘é┘à ${args.id} ╪¿┘å╪¼╪º╪¡. Γ£¿ ┘ä╪º ╪¬┘ê╪¼╪» ╪¬╪╣╪º╪▒╪╢╪º╪¬ ┘ü┘è ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐.`;
                } else {
                    await Instruction.update({
                        clientName: args.clientName,
                        title: args.clientName,
                        content: args.content,
                        keywords: args.keywords
                    }, { where: { id: args.id, UserId: userId } });
                    return `Γ£à ╪¬┘à ╪¬╪╣╪»┘è┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ╪▒┘é┘à ${args.id} ╪¿┘å╪¼╪º╪¡.`;
                }
            }
            else if (fnName === 'search_instructions') {
                const results = await Instruction.findAll({
                    where: {
                        UserId: userId,
                        [Op.or]: [
                            { clientName: { [Op.like]: `%${args.query}%` } },
                            { content: { [Op.like]: `%${args.query}%` } },
                            { keywords: { [Op.like]: `%${args.query}%` } }
                        ]
                    },
                    limit: 5
                });
                if (results.length === 0) return `┘ä┘à ╪ú╪¼╪» ╪ú┘è ╪¬╪╣┘ä┘è┘à╪º╪¬ ┘à╪│╪¼┘ä╪⌐ ┘à╪¬╪╣┘ä┘é╪⌐ ╪¿┘Ç: "${args.query}"`;
                return `┘ê╪¼╪»╪¬ ${results.length} ╪¬╪╣┘ä┘è┘à╪⌐:\n\n` + results.map(r =>
                    `≡ƒôî ID: ${r.id} | "${r.clientName}"\n   ≡ƒô¥ ╪º┘ä┘à╪¡╪¬┘ê┘ë: ${r.content.substring(0, 80)}...\n   ≡ƒöæ ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐: ${r.keywords || '┘ä╪º ┘è┘ê╪¼╪»'}`
                ).join('\n\n');
            }
            else if (fnName === 'list_all_instructions') {
                const allInstructions = await Instruction.findAll({
                    where: { UserId: userId },
                    order: [['order', 'ASC'], ['createdAt', 'DESC']],
                    attributes: ['id', 'clientName', 'content', 'keywords', 'type', 'isActive']
                });
                if (allInstructions.length === 0) {
                    return '≡ƒô¡ ┘ä╪º ╪¬┘ê╪¼╪» ╪¬╪╣┘ä┘è┘à╪º╪¬ ┘à╪¡┘ü┘ê╪╕╪⌐ ╪¡╪¬┘ë ╪º┘ä╪ó┘å. ╪º╪¿╪»╪ú ╪¿╪Ñ╪╢╪º┘ü╪⌐ ╪¬╪╣┘ä┘è┘à╪⌐ ╪¼╪»┘è╪»╪⌐!';
                }
                const activeCount = allInstructions.filter(i => i.isActive).length;
                const inactiveCount = allInstructions.length - activeCount;
                let response = `≡ƒôÜ **╪Ñ╪¼┘à╪º┘ä┘è ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬: ${allInstructions.length}** (${activeCount} ┘å╪┤╪╖╪⌐ | ${inactiveCount} ┘à╪╣╪╖┘ä╪⌐)\n\n`;
                response += allInstructions.map(r => {
                    const statusIcon = r.isActive ? '≡ƒƒó' : '≡ƒö┤';
                    const typeIcon = r.type === 'global' ? '≡ƒîÉ' : '≡ƒÄ»';
                    const kwList = r.keywords ? r.keywords.split(',').map(k => k.trim()).slice(0, 5).join(', ') : '┘ä╪º ┘è┘ê╪¼╪»';
                    const contentPreview = r.content ? r.content.substring(0, 60) + (r.content.length > 60 ? '...' : '') : '';
                    return `${statusIcon} ${typeIcon} **ID: ${r.id}** | ${r.clientName}\n   ≡ƒô¥ ${contentPreview}\n   ≡ƒöæ ${kwList}`;
                }).join('\n\n');
                return response;
            }
            else if (fnName === 'analyze_conflicts') {
                const allInstructions = await Instruction.findAll({
                    where: { UserId: userId, isActive: true },
                    attributes: ['id', 'clientName', 'keywords', 'content']
                });
                if (allInstructions.length === 0) {
                    return '≡ƒô¡ ┘ä╪º ╪¬┘ê╪¼╪» ╪¬╪╣┘ä┘è┘à╪º╪¬ ┘ä╪¬╪¡┘ä┘è┘ä┘ç╪º.';
                }
                // Build keyword map
                const kwMap = {};
                const normalizeKw = (kw) => kw.toLowerCase().trim();
                allInstructions.forEach(inst => {
                    if (!inst.keywords) return;
                    inst.keywords.split(',').map(k => normalizeKw(k)).filter(k => k.length > 2).forEach(kw => {
                        if (!kwMap[kw]) kwMap[kw] = [];
                        kwMap[kw].push({ id: inst.id, clientName: inst.clientName });
                    });
                });
                // Find conflicts
                const conflicts = [];
                Object.entries(kwMap).forEach(([kw, instList]) => {
                    if (instList.length > 1) {
                        conflicts.push({ keyword: kw, instructions: instList });
                    }
                });
                if (conflicts.length === 0) {
                    return `Γ£à **┘à┘à╪¬╪º╪▓! ┘ä╪º ┘è┘ê╪¼╪» ╪ú┘è ╪¬╪╣╪º╪▒╪╢ ┘ü┘è ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐.**\n\n╪¼┘à┘è╪╣ ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ (${allInstructions.length}) ┘ä╪»┘è┘ç╪º ┘â┘ä┘à╪º╪¬ ┘à┘ü╪¬╪º╪¡┘è╪⌐ ┘ü╪▒┘è╪»╪⌐ ┘ê┘à╪¬┘à╪º┘è╪▓╪⌐. ╪º┘ä╪¿┘ê╪¬ ╪│┘è╪╣┘à┘ä ╪¿┘â┘ü╪º╪í╪⌐ ╪╣╪º┘ä┘è╪⌐.`;
                }
                // Group conflicts by instruction
                const instConflictMap = {};
                conflicts.forEach(({ keyword, instructions }) => {
                    instructions.forEach(inst => {
                        if (!instConflictMap[inst.id]) instConflictMap[inst.id] = { clientName: inst.clientName, conflictingKws: [], conflictsWith: new Set() };
                        instConflictMap[inst.id].conflictingKws.push(keyword);
                        instructions.forEach(other => { if (other.id !== inst.id) instConflictMap[inst.id].conflictsWith.add(`ID:${other.id} "${other.clientName}"`); });
                    });
                });
                let response = `ΓÜö∩╕Å **┘ê╪¼╪»╪¬ ${conflicts.length} ╪¬╪╣╪º╪▒╪╢ ┘ü┘è ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐:**\n\n`;
                response += `**╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä┘à╪¬╪ú╪½╪▒╪⌐:**\n`;
                Object.entries(instConflictMap).forEach(([id, data]) => {
                    const conflictsWithList = [...data.conflictsWith].join(', ');
                    response += `≡ƒö┤ **ID: ${id}** | "${data.clientName}"\n`;
                    response += `   Γå│ ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à╪¬╪╣╪º╪▒╪╢╪⌐: [${data.conflictingKws.map(k => '"' + k + '"').join(', ')}]\n`;
                    response += `   Γå│ ╪¬╪¬╪╣╪º╪▒╪╢ ┘à╪╣: ${conflictsWithList}\n\n`;
                });
                response += `\n≡ƒÆí **┘à┘é╪¬╪▒╪¡╪º╪¬ ┘ä╪Ñ╪╡┘ä╪º╪¡ ╪º┘ä╪¬╪╣╪º╪▒╪╢╪º╪¬:**\n`;
                // Generate suggestions per conflicting pair
                const processedPairs = new Set();
                conflicts.forEach(({ keyword, instructions }) => {
                    const pairKey = instructions.map(i => i.id).sort().join('-');
                    if (processedPairs.has(pairKey)) return;
                    processedPairs.add(pairKey);
                    response += `\n≡ƒôî ┘â┘ä┘à╪⌐ "${keyword}" ┘à┘â╪▒╪▒╪⌐ ┘ü┘è: ${instructions.map(i => `ID:${i.id} "${i.clientName}"`).join(' ┘ê ')}\n`;
                    response += `   Γ£Å∩╕Å ╪º┘ä┘à┘é╪¬╪▒╪¡: ╪º╪¡╪░┘ü "${keyword}" ┘à┘å ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä╪¬┘è ┘ä╪º ╪¬╪¬╪╣┘ä┘é ┘à╪¿╪º╪┤╪▒╪⌐ ╪¿┘ç╪º ┘ê╪ú╪¿┘é┘ç╪º ┘ü┘é╪╖ ┘ü┘è ╪º┘ä╪ú┘å╪│╪¿.\n`;
                });
                response += `\n≡ƒôú ┘é┘ä ┘ä┘è "╪╖╪¿┘æ┘é ╪º┘ä┘à┘é╪¬╪▒╪¡ ╪╣┘ä┘ë ID [╪▒┘é┘à]" ┘ä╪¬╪╣╪»┘è┘ä ┘â┘ä┘à╪º╪¬┘ç╪º ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐ ╪ú┘ê ┘é┘ä "╪╣╪»┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪⌐ ╪▒┘é┘à [ID] ┘ê╪┤┘è┘ä ┘â┘ä┘à╪⌐ [┘â┘ä┘à╪⌐] ┘à┘å Keywords" ┘ä┘ä╪¬╪╣╪»┘è┘ä ╪º┘ä┘è╪»┘ê┘è.`;
                return response;
            }
        }

        // 2. Check for normal text response
        const reply = part?.text;
        return reply || "╪╣╪░╪▒╪º┘ï ┘ä┘à ╪ú┘ü┘ç┘à ╪º┘ä┘à╪╖┘ä┘ê╪¿.";

    } catch (error) {
        console.error("Teach Chat Failed:", error);
        return "╪╣╪░╪▒╪º┘ï╪î ╪¡╪»╪½ ╪«╪╖╪ú ╪ú╪½┘å╪º╪í ╪¬╪┤╪║┘è┘ä ╪┤╪º╪¬ ╪º┘ä╪¬╪»╪▒┘è╪¿.";
    }
}

// ============================================================
// ≡ƒ¢í∩╕Å Live Chat & Human Handoff Method
// ============================================================
export async function sendManualMessage(userId, remoteJid, text) {
    const sock = sessions.get(parseInt(userId, 10)) || sessions.get(String(userId));
    if (!sock) throw new Error("╪º┘ä╪¿┘ê╪¬ ╪║┘è╪▒ ┘à╪¬╪╡┘ä ╪¡╪º┘ä┘è╪º┘ï.");
    
    // ╪Ñ╪▒╪│╪º┘ä ╪º┘ä╪▒╪│╪º┘ä╪⌐
    await sock.sendMessage(remoteJid, { text });
    
    // ╪¡┘ü╪╕ ╪º┘ä╪▒╪│╪º┘ä╪⌐
    const savedMsg = await Message.create({
        UserId: userId,
        remoteJid,
        role: 'model',
        content: text
    });
    
    // ╪¬╪¡╪»┘è╪½ ╪º┘ä┘à╪¡╪º╪»╪½╪⌐
    await Conversation.update(
        { lastMessageText: text, lastMessageAt: new Date() },
        { where: { UserId: userId, remoteJid } }
    );
    
    return savedMsg;
}

export async function notifyControlGroup(userId, message) {
    try {
        const userObj = await User.findByPk(userId);
        if (!userObj || !userObj.control_group_jid) return false;
        
        const sock = sessions.get(parseInt(userId, 10)) || sessions.get(String(userId));
        if (sock) {
            await sock.sendMessage(userObj.control_group_jid, { text: message });
            return true;
        }
    } catch (error) {
        console.error("Error notifying control group:", error);
    }
    return false;
}
