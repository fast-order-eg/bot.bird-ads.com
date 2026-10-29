import fetch from 'node-fetch';
import { CONFIG } from '../config.js';
import User from '../models/User.js';
import Instruction from '../models/Instruction.js';
import MessengerPage from '../models/MessengerPage.js';
import MessengerPageAccount from '../models/MessengerPageAccount.js';
import MessengerConversation from '../models/MessengerConversation.js';
import Message from '../models/Message.js';
import { GoogleAuth } from 'google-auth-library';
import { notifyControlGroup } from './botController.js';

// الـ Verify Token اللي بنستخدمه مع ميتا
const VERIFY_TOKEN = 'lina_messenger_verify_2024';

// ======================================================
// دالة للتحقق من الـ Webhook اللي بتطلبها ميتا (GET)
// ======================================================
export function verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ [Messenger] Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        console.error('❌ [Messenger] Webhook verification failed!');
        res.sendStatus(403);
    }
}

// ======================================================
// دالة لاستقبال الرسائل القادمة من ميتا (POST)
// ======================================================
export async function handleWebhook(req, res) {
    // دايماً نبعت 200 فوراً عشان ميتا ما تعيد المحاولة
    res.sendStatus(200);

    const body = req.body;
    console.log('📨 [Messenger Webhook] Received event:', JSON.stringify(body).substring(0, 300));

    if (body.object !== 'page' && body.object !== 'instagram') {
        console.log('⚠️ [Messenger Webhook] Not a page event, ignoring.');
        return;
    }

    for (const entry of body.entry) {
        const pageId = entry.id;
        console.log(`📌 [Messenger] Entry from page: ${pageId}`);

        // ======================================================
        // معالجة أحداث الكومنتات (feed changes)
        // ======================================================
        if (entry.changes && entry.changes.length > 0) {
            for (const change of entry.changes) {
                if ((change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') || change.field === 'comments') {
                    const commentData = change.value;
                    console.log(`💬 [Messenger] New comment on page ${pageId}:`, JSON.stringify(commentData).substring(0, 200));
                    try {
                        await handleCommentEvent(pageId, commentData);
                    } catch (err) {
                        console.error(`[Messenger] Error handling comment:`, err);
                    }
                }
            }
        }

        // ======================================================
        // معالجة رسائل الماسنجر (messaging events)
        // ======================================================
        if (entry.messaging && entry.messaging.length > 0) {
            for (const event of entry.messaging) {
                // معالجة الـ echo (الرسائل المرسلة من الصفحة)
                if (event.message?.is_echo) {
                    const customerId = event.recipient?.id;
                    const appId = event.message.app_id;
                    const myAppId = process.env.FB_APP_ID;
                    
                    // لو مافيش app_id أو الـ app_id مش بتاعنا، معناه إن موظف رد من الـ Inbox
                    if (!appId || (myAppId && String(appId) !== String(myAppId))) {
                        if (customerId) {
                            console.log(`👤 [Takeover] Human manually replied to ${customerId} on page ${pageId}. Disabling AI.`);
                            try {
                                await MessengerConversation.update(
                                    { is_handoff: true },
                                    { where: { pageId: pageId, senderId: customerId } }
                                );
                            } catch (err) {
                                console.error('[Takeover] Error updating is_handoff:', err);
                            }
                        }
                    }
                    continue;
                }
                
                // تجاهل الـ read و delivery events
                if (!event.message?.text && !event.postback?.payload && !event.message?.quick_reply?.payload) continue;

                const senderId = event.sender.id;
                const messageText = event.message?.text || event.postback?.title || '';
                const quickReplyPayload = event.message?.quick_reply?.payload || event.postback?.payload || null;
                console.log(`💬 [Messenger] Message from ${senderId}: "${messageText}"${quickReplyPayload ? ` [Payload: ${quickReplyPayload}]` : ''}`);

                try {
                    await processMessengerMessage(pageId, senderId, messageText, null, quickReplyPayload);
                } catch (err) {
                    console.error(`[Messenger] Error processing message from ${senderId}:`, err);
                }
            }
        }
    }
}

// ======================================================
// دالة لجلب الحساب التالي النشط للدوران (Round-Robin)
// ======================================================
export async function getNextActiveAccount(pageId) {
    try {
        const accounts = await MessengerPageAccount.findAll({
            where: { pageId, isActive: true, status: 'active' },
            order: [['lastUsedAt', 'ASC'], ['id', 'ASC']]
        });
        if (accounts && accounts.length > 0) {
            return accounts[0];
        }
    } catch (e) {
        console.error('[getNextActiveAccount] Error:', e);
    }
    return null;
}

// ======================================================
// دالة لتنفيذ عمليات المراسلة مع التبديل التلقائي وتوزيع الأحمال بالتساوي
// ======================================================
export async function executeWithFailover(pageId, apiFn) {
    let accounts = [];
    try {
        accounts = await MessengerPageAccount.findAll({
            where: { pageId, isActive: true, status: 'active' },
            order: [['lastUsedAt', 'ASC'], ['id', 'ASC']]
        });
    } catch (e) {
        console.error('[executeWithFailover] Error querying accounts:', e);
    }

    // إذا لم توجد حسابات نشطة في الجدول، نلجأ إلى page.accessToken كـ Fallback
    if (!accounts || accounts.length === 0) {
        const page = await MessengerPage.findOne({ where: { pageId } });
        if (!page || !page.accessToken) {
            console.error(`[executeWithFailover] No access token found for page ${pageId}`);
            return { error: 'No access token available' };
        }
        return await apiFn(page.accessToken);
    }

    let lastResult = null;
    for (const acc of accounts) {
        try {
            const result = await apiFn(acc.accessToken);
            lastResult = result;

            if (result && result.error) {
                const err = result.error;
                const errStr = JSON.stringify(err);
                const isCheckpoint = errStr.includes('checkpoint') || (err.code === 190 && err.error_subcode === 459) || errStr.includes('You cannot access the app');
                const isTokenExpired = err.code === 190;

                if (isCheckpoint) {
                    console.error(`🚨 [Account Checkpoint] الحساب "${acc.fbUserName}" (${acc.fbUserId}) اتقفل سيلفي/تحقق. يتم استبعاده وتجربة الحساب التالي...`);
                    await acc.update({ status: 'checkpoint', lastError: err.message || 'حساب فيسبوك محظور (سيلفي / تحقق)' });
                    continue; // جرب الحساب اللي بعده فوراً!
                } else if (isTokenExpired) {
                    console.error(`⚠️ [Account Expired] توكن الحساب "${acc.fbUserName}" منتهي الصلاحية. يتم تجربة الحساب التالي...`);
                    await acc.update({ status: 'error', lastError: err.message || 'انتهت صلاحية الرمز' });
                    continue; // جرب الحساب اللي بعده
                } else {
                    return result;
                }
            }

            // العملية نجحت! حدّث وقت آخر استخدام للدوران بالتساوي
            acc.update({ lastUsedAt: new Date(), lastError: null }).catch(() => {});
            return result;
        } catch (callErr) {
            lastResult = { error: callErr };
            console.error(`[executeWithFailover] Exception during call for "${acc.fbUserName}":`, callErr);
        }
    }
    return lastResult;
}

// ======================================================
// معالجة حدث الكومنت: لايك + رد ترحيبي + فتح ماسنجر بالـ AI
// ======================================================
async function handleCommentEvent(pageId, commentData) {
    // جيب بيانات الصفحة من قاعدة البيانات
    const { Op } = await import('sequelize');
    const page = await MessengerPage.findOne({ where: { [Op.or]: [{ pageId }, { instagramId: pageId } ], isActive: true } });
    if (!page) {
        console.warn(`[Messenger Comment] No active page found for pageId: ${pageId}`);
        return;
    }

    const commentId = commentData.comment_id || commentData.id;
    const commenterId = commentData.from?.id;
    const commenterName = commentData.from?.name || commentData.from?.username || 'العميل';
    const commentText = commentData.message || commentData.text || '';

    if (!commentId || !commenterId) {
        console.warn('[Messenger Comment] Missing commentId or commenterId, skipping.');
        return;
    }

    // تجاهل لو الكومنت من الصفحة نفسها (Bot echo)
    if (commenterId === pageId) {
        console.log('[Messenger Comment] Comment from page itself, ignoring.');
        return;
    }

    console.log(`💬 [Comment] From: ${commenterName} (${commenterId}) | Text: "${commentText}"`);

    // 1. عمل لايك على الكومنت بالتناوب
    await executeWithFailover(pageId, (token) => likeComment(commentId, token));

    // 2. الرد على الكومنت بالرسالة الترحيبية بالتناوب
    const firstName = commenterName.split(' ')[0];
    let publicReply = page.defaultComment || 'أهلاً وسهلاً بحضرتك 😊\nتم إرسال التفاصيل لك في الرسائل الخاصة ✅';
    publicReply = publicReply.replace('{name}', firstName);
    await executeWithFailover(pageId, (token) => replyToComment(commentId, publicReply, token));

    // 3. فتح محادثة ماسنجر مع العميل
    // لو النظام = fixed reply: ابعت الرد الثابت مرة واحدة بس بالتناوب
    if (page.replyMode === 'fixed') {
        if (page.fixedReply && commenterId) {
            const fixedMsg = page.fixedReply.replace('{name}', firstName);
            try {
                // تحديث أو إنشاء المحادثة
                const [conv, wasCreated] = await (await import('../models/MessengerConversation.js')).default.findOrCreate({
                    where: { pageId, senderId: commenterId },
                    defaults: { UserId: page.UserId, pageId, senderId: commenterId, messageCount: 0, is_handoff: false }
                });

                // إرسال الرد الثابت دائماً مع أي كومنت جديد بالتناوب
                await executeWithFailover(pageId, (token) => sendPrivateReplyToComment(commentId, fixedMsg, token));
                await conv.update({ messageCount: conv.messageCount + 1, lastMessageAt: new Date() });
                await Message.create({ UserId: page.UserId, remoteJid: `msng_${pageId}_${commenterId}`, role: 'model', content: fixedMsg });
                console.log(`✅ [Fixed Reply] Sent fixed reply to ${commenterId} (via comment)`);
            } catch (err) {
                console.error('[Fixed Reply Comment] Error:', err);
            }
        }
        return;
    }

    // وضع AI: ابعت الرد بالذكاء الاصطناعي
    if (commentText.trim().length > 0) {
        try {
            await processMessengerMessage(pageId, commenterId, commentText, commentId);
        } catch (err) {
            console.error('[Messenger Comment] Error processing AI reply:', err);
        }
    }
}

// ======================================================
// عمل لايك على كومنت
// ======================================================
async function likeComment(commentId, accessToken) {
    try {
        const response = await fetch(`https://graph.facebook.com/v18.0/${commentId}/likes?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.success || data === true) {
            console.log(`✅ [Comment] Liked comment: ${commentId}`);
        } else {
            console.warn(`⚠️ [Comment] Failed to like comment ${commentId}:`, data);
        }
        return data;
    } catch (err) {
        console.error(`[Comment] Error liking comment ${commentId}:`, err);
        return { error: err };
    }
}

// ======================================================
// الرد على كومنت عام
// ======================================================
async function replyToComment(commentId, message, accessToken) {
    try {
        let response = await fetch(`https://graph.facebook.com/v18.0/${commentId}/comments?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message.substring(0, 2000) })
        });
        let data = await response.json();
        if (!data.id) {
            response = await fetch(`https://graph.facebook.com/v18.0/${commentId}/replies?access_token=${accessToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.substring(0, 2000) })
            });
            data = await response.json();
        }
        if (data.id) {
            console.log(`✅ [Comment] Replied to comment: ${commentId} | Reply ID: ${data.id}`);
        } else {
            console.warn(`⚠️ [Comment] Failed to reply to comment ${commentId}:`, data);
        }
        return data;
    } catch (err) {
        console.error(`[Comment] Error replying to comment ${commentId}:`, err);
        return { error: err };
    }
}

// ======================================================
// الدالة الرئيسية لمعالجة الرسائل والرد عليها بالـ AI
// ======================================================
async function processMessengerMessage(pageId, senderId, messageText, commentId = null, quickReplyPayload = null) {
    // 1. جيب بيانات الصفحة من قاعدة البيانات
    const { Op } = await import('sequelize');
    const page = await MessengerPage.findOne({ where: { [Op.or]: [{ pageId }, { instagramId: pageId } ], isActive: true } });
    if (!page) {
        console.warn(`[Messenger] No active page found for pageId: ${pageId}`);
        return;
    }

    const userId = page.UserId;
    const activeAcc = await getNextActiveAccount(pageId);
    const accessToken = activeAcc ? activeAcc.accessToken : page.accessToken;

    // إرسال علامة "يكتب الآن..." فوراً
    sendMessengerAction(senderId, 'typing_on', accessToken);
    // تكرار إرسال العلامة كل 8 ثواني عشان ماتختفيش لو الرد اتأخر
    const typingInterval = setInterval(() => {
        sendMessengerAction(senderId, 'typing_on', accessToken);
    }, 8000);

    try {
        // 2. اعمل أو حدّث بيانات الـ conversation
        let [conversation, created] = await MessengerConversation.findOrCreate({
            where: { pageId, senderId },
            defaults: { UserId: userId, pageId, senderId, messageCount: 0, is_handoff: false }
        });

        // إذا كان الموظف قد تدخل، نوقف الرد
        if (conversation.is_handoff) {
            console.log(`⏸️ [Takeover] AI is paused for ${senderId}. Skipping reply.`);
            return;
        }

        // جيب الصور المرفقة للرد الثابت إن وجدت
        let fixedImages = [];
        if (page.fixedReplyImages) {
            try {
                fixedImages = typeof page.fixedReplyImages === 'string' ? JSON.parse(page.fixedReplyImages) : page.fixedReplyImages;
                if (!Array.isArray(fixedImages)) fixedImages = [];
            } catch (e) {
                fixedImages = [];
            }
        }

        const cleanMsg = (messageText || '').trim().toLowerCase();
        const isRequestingImages = quickReplyPayload === 'VIEW_FIXED_IMAGES' || 
                                   cleanMsg === '📸 عرض الصور' || 
                                   cleanMsg.includes('عرض الصور') || 
                                   cleanMsg.includes('وريني الصور') || 
                                   cleanMsg.includes('عايز الصور') || 
                                   cleanMsg.includes('عاوزه الصور') || 
                                   cleanMsg.includes('عايزه الصور') || 
                                   cleanMsg === 'الصور' || 
                                   cleanMsg === 'صور';

        // إذا ضغط العميل على زرار عرض الصور أو طلب الصور بالاسم في وضع الرد الثابت
        if (page.replyMode === 'fixed' && isRequestingImages) {
            if (fixedImages.length > 0) {
                console.log(`📸 [Fixed Images] Sending ${fixedImages.length} images to ${senderId}`);
                await executeWithFailover(pageId, (tok) => sendMessengerImages(senderId, fixedImages, tok));
            } else {
                await executeWithFailover(pageId, (tok) => sendMessengerReply(senderId, 'عفواً، لا توجد صور إضافية متوفرة حالياً.', tok));
            }
            await conversation.update({ messageCount: conversation.messageCount + 1, lastMessageAt: new Date() });
            clearInterval(typingInterval);
            return;
        }

        // معالجة الأزرار التفاعلية المخصصة إن وجدت
        if (quickReplyPayload && quickReplyPayload.startsWith('BTN_')) {
            const btnIdOrPk = quickReplyPayload.replace('BTN_', '');
            try {
                const InteractiveButton = (await import('../models/InteractiveButton.js')).default;
                const button = await InteractiveButton.findOne({
                    where: {
                        [Op.or]: [{ id: btnIdOrPk }, { buttonId: btnIdOrPk }],
                        UserId: userId,
                        isActive: true
                    }
                });
                if (button) {
                    if (button.responseText) {
                        await executeWithFailover(pageId, (tok) => sendMessengerReply(senderId, button.responseText, tok));
                    }
                    if (button.responseImage) {
                        await executeWithFailover(pageId, (tok) => sendMessengerImage(senderId, button.responseImage, tok));
                    }
                    await conversation.update({ messageCount: conversation.messageCount + 1, lastMessageAt: new Date() });
                    clearInterval(typingInterval);
                    return;
                }
            } catch (btnErr) {
                console.error('[Button Response Error]:', btnErr);
            }
        }

        // ====== وضع الرد الثابت ======
        if (page.replyMode === 'fixed') {
            if (page.fixedReply) {
                const isIg = Boolean(page.instagramId && (pageId === page.instagramId));
                const allowReply = commentId ? true : (isIg ? page.replyToIgMessagesWithFixed : page.replyToMessagesWithFixed);

                // تخصيص اسم العميل لو الرسالة تحتوي على {name}
                let fixedMsg = page.fixedReply;
                if (conversation.senderName && conversation.senderName !== 'عميل') {
                    fixedMsg = fixedMsg.replace(/{name}/g, conversation.senderName.split(' ')[0]);
                } else {
                    fixedMsg = fixedMsg.replace(/{name}/g, 'يا فندم');
                }

                if (allowReply && (created || commentId || conversation.messageCount === 0)) {
                    await Message.create({ UserId: userId, remoteJid: `msng_${pageId}_${senderId}`, role: 'model', content: fixedMsg });
                    
                    if (commentId) {
                        await executeWithFailover(pageId, (tok) => sendPrivateReplyToComment(commentId, fixedMsg, tok));
                    } else {
                        // إعداد الأزرار السريعة (Quick Replies)
                        let quickReplies = [];

                        // 1. زرار عرض الصور إذا كانت هناك صور مرفقة
                        if (fixedImages.length > 0) {
                            quickReplies.push({
                                content_type: 'text',
                                title: '📸 عرض الصور',
                                payload: 'VIEW_FIXED_IMAGES'
                            });
                        }

                        // 2. الأزرار التفاعلية المخصصة لو الخيار مفعّل
                        if (page.useButtonsWithFixedReply) {
                            try {
                                const InteractiveButton = (await import('../models/InteractiveButton.js')).default;
                                const buttons = await InteractiveButton.findAll({
                                    where: {
                                        UserId: userId,
                                        isActive: true,
                                        platform: ['both', 'messenger']
                                    },
                                    order: [['order', 'ASC'], ['createdAt', 'ASC']],
                                    limit: 10
                                });
                                for (const btn of buttons) {
                                    if (quickReplies.length < 13) {
                                        quickReplies.push({
                                            content_type: 'text',
                                            title: btn.label.substring(0, 20),
                                            payload: `BTN_${btn.buttonId || btn.id}`
                                        });
                                    }
                                }
                            } catch (btnErr) {
                                console.error('[Fixed Reply Buttons] Error fetching buttons:', btnErr);
                            }
                        }

                        // إرسال الرد الثابت مع الأزرار
                        if (quickReplies.length > 0) {
                            await executeWithFailover(pageId, (tok) => sendMessengerReply(senderId, fixedMsg, tok, quickReplies));
                        } else {
                            await executeWithFailover(pageId, (tok) => sendMessengerReply(senderId, fixedMsg, tok));
                        }

                        // لو فيه صورة واحدة فقط مرفقة، إرسالها فوراً مع الرسالة
                        if (fixedImages.length === 1) {
                            await new Promise(r => setTimeout(r, 800));
                            await executeWithFailover(pageId, (tok) => sendMessengerImage(senderId, fixedImages[0], tok));
                        }
                    }
                    console.log(`✅ [Fixed Reply] Sent to ${senderId}${fixedImages.length > 0 ? ` (with ${fixedImages.length} images option)` : ''}`);
                    await conversation.update({ messageCount: conversation.messageCount + 1, lastMessageAt: new Date() });
                } else if (!allowReply) {
                    console.log(`⏸️ [Fixed Reply] Messages reply disabled for ${isIg ? 'Instagram' : 'Facebook'}, skipping.`);
                } else {
                    console.log(`⏸️ [Fixed Reply] Already sent greeting to ${senderId} (count: ${conversation.messageCount}). Skipping duplicate reply.`);
                    await conversation.update({ lastMessageAt: new Date() });
                }
            }
            clearInterval(typingInterval);
            return;
        }

        // 3. جيب اسم المرسل من ميتا (لو مجبناهوش قبل كده)
        if (created || conversation.senderName === 'عميل') {
            try {
                const profileRes = await fetch(`https://graph.facebook.com/v18.0/${senderId}?fields=name&access_token=${accessToken}`);
                const profileData = await profileRes.json();
                if (profileData.name) {
                    await conversation.update({ senderName: profileData.name });
                }
            } catch (e) {
                // لو مش قادر يجيب الاسم، مش مشكلة
            }
        }

        // 4. حدّث عدد الرسائل وتاريخ آخر رسالة
        await conversation.update({
            messageCount: conversation.messageCount + 1,
            lastMessageAt: new Date()
        });

        // 5. احفظ الرسالة في جدول الرسائل
        const conversationId = `msng_${pageId}_${senderId}`;
        await Message.create({
            UserId: userId,
            remoteJid: conversationId,
            role: 'user',
            content: messageText
        });

        // 6. استدعي الـ AI للرد
        let aiReply = await callVertexAIForMessenger(userId, senderId, messageText, conversationId);

        if (aiReply) {
            // Check for AI Handoff trigger
            if (aiReply.includes('[HANDOFF]')) {
                console.log(`🤖 [AI Handoff] AI decided to transfer conversation ${senderId} to human.`);
                await conversation.update({ is_handoff: true });
                
                const handoffMessage = "عفواً، سأقوم بتحويلك الآن لأحد ممثلي خدمة العملاء للرد على استفسارك بدقة. يرجى الانتظار لحين الرد عليك.";
                await Message.create({ UserId: userId, remoteJid: conversationId, role: 'model', content: handoffMessage });
                await executeWithFailover(pageId, (tok) => sendMessengerReply(senderId, handoffMessage, tok));
                
                // Notify WhatsApp Control Group
                try {
                    const notifyMsg = `🚨 *طلب تدخل بشري (تحويل تلقائي)*\n\n👤 العميل: ${conversation.senderName || senderId}\n📱 المنصة: ماسنجر\n\nيرجى التوجه للوحة التحكم للرد على العميل.`;
                    await notifyControlGroup(userId, notifyMsg);
                } catch (e) {
                    console.error("Failed to notify control group for messenger handoff", e);
                }
                
                return;
            }

            // FIX: Clean up Markdown links [text](url) -> url (if text is similar) to prevent duplication in Messenger
            aiReply = aiReply.replace(/\[([^\]]*?)\]\(([^)]+?)\)/g, (match, text, url) => {
                const cleanText = text.trim();
                const cleanUrl = url.trim();
                if (cleanText === cleanUrl || cleanUrl.includes(cleanText)) {
                    return cleanUrl;
                }
                return `${cleanText}: ${cleanUrl}`;
            });

            // 7. احفظ رد الـ AI
            await Message.create({
                UserId: userId,
                remoteJid: conversationId,
                role: 'model',
                content: aiReply
            });

            // 8. ابعت الرد للعميل على الماسنجر
            if (commentId) {
                // دايماً استخدم ميزة Private Reply المخصصة للكومنتات لأي كومنت
                await executeWithFailover(pageId, (tok) => sendPrivateReplyToComment(commentId, aiReply, tok));
            } else {
                await executeWithFailover(pageId, (tok) => sendMessengerReply(senderId, aiReply, tok));
            }
        }
    } finally {
        clearInterval(typingInterval);
    }
}

// ======================================================
// استدعاء Vertex AI خصيصاً للماسنجر
// ======================================================
async function callVertexAIForMessenger(userId, senderId, userText, conversationId) {
    try {
        // جيب التعليمات المفعّلة لهذا المستخدم
        const allInstructions = await Instruction.findAll({
            where: { UserId: userId, isActive: true },
            order: [['order', 'ASC'], ['createdAt', 'DESC']]
        });

        const normalizeText = (text) => text ? text.toLowerCase().trim() : "";
        const userQuery = normalizeText(userText);

        // فلتر التعليمات بنفس منطق الواتساب
        let filteredInstructions = allInstructions.filter(inst => {
            if (inst.type === 'global') return true;
            if (inst.keywords) {
                const keywords = inst.keywords.split(',').map(k => normalizeText(k));
                return keywords.some(k => k.length > 2 && userQuery.includes(k));
            }
            return false;
        });

        // لو مافيش تعليمات مفلترة، خذ global فقط
        if (filteredInstructions.length === 0) {
            filteredInstructions = allInstructions.filter(inst => inst.type === 'global');
        }

        // ابني الـ system prompt
        let systemInstructions = filteredInstructions.map(inst => inst.content).join('\n\n---\n\n');
        
        // Strict anti-hallucination and handoff instruction
        systemInstructions += '\n\n💡 **تعليمات صارمة جداً (يمنع مخالفتها):**\n';
        systemInstructions += '1. أنت مساعد ذكي وملتزم جداً بالتعليمات والبيانات المتوفرة لك فقط.\n';
        systemInstructions += '2. إذا سألك العميل عن أي سؤال أو "سعر" لا يوجد إجابته في السياق الحالي، يمنع منعاً باتاً تأليف أي إجابة من خيالك.\n';
        systemInstructions += '3. إذا شعرت بالارتباك أو طلب العميل التحدث لموظف بشري، يجب عليك الرد بكلمة واحدة فقط وهي بالضبط: [HANDOFF]\n';
        systemInstructions += '4. لا تكتب أي كلام آخر مع كلمة [HANDOFF].\n';

        // جيب آخر 10 رسائل كـ context
        const historySaved = await Message.findAll({
            where: { UserId: userId, remoteJid: conversationId },
            order: [['createdAt', 'DESC']],
            limit: 10
        });
        const history = historySaved.reverse();

        const historyText = history.map(msg =>
            `${msg.role === 'user' ? 'العميل' : 'المساعد'}: ${msg.content}`
        ).join('\n');

        const prompt = `${systemInstructions}\n\nسياق المحادثة السابقة:\n${historyText}\n\nالعميل: ${userText}\nالمساعد:`;

        const url = CONFIG.getVertexUrl ? CONFIG.getVertexUrl() : `https://aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/global/publishers/google/models/${CONFIG.MODEL_NAME}:generateContent`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1, // Very low temperature to prevent hallucination
                topK: 20,
                topP: 0.8,
                maxOutputTokens: 1024,
            }
        };

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
            throw new Error(`Vertex API Error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;

    } catch (err) {
        console.error('[Messenger] Vertex AI Error:', err);
        return 'عذراً، حدث خطأ مؤقت. يرجى المحاولة مرة أخرى.';
    }
}

// ======================================================
// إرسال رد للماسنجر عبر Graph API
// ======================================================
export async function sendMessengerReply(recipientId, text, accessToken, quickReplies = null) {
    try {
        const payload = {
            recipient: { id: recipientId },
            message: { text: text.substring(0, 2000) }
        };
        if (quickReplies && Array.isArray(quickReplies) && quickReplies.length > 0) {
            payload.message.quick_replies = quickReplies;
        }

        const response = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.error) {
            console.error('[Messenger] Send Error:', data.error);
            // لو فشل الإرسال بسبب quick_replies، حاول نبعت النص العادي فقط كـ fallback
            if (payload.message.quick_replies) {
                return await sendMessengerReply(recipientId, text, accessToken, null);
            }
        } else {
            console.log(`✅ [Messenger] Reply sent to ${recipientId}${quickReplies ? ' (with quick replies)' : ''}`);
        }
        return data;
    } catch (err) {
        console.error('[Messenger] Failed to send reply:', err);
    }
}

// ======================================================
// إرسال صورة فردية للماسنجر عبر Graph API
// ======================================================
export async function sendMessengerImage(recipientId, imageUrl, accessToken) {
    try {
        let fullUrl = imageUrl;
        if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
            fullUrl = `https://bot.bird-ads.com${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
        }

        const response = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: {
                    attachment: {
                        type: 'image',
                        payload: {
                            url: fullUrl,
                            is_reusable: true
                        }
                    }
                }
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error('[Messenger] Send Image Error:', data.error);
        } else {
            console.log(`✅ [Messenger] Image sent to ${recipientId}: ${fullUrl}`);
        }
        return data;
    } catch (err) {
        console.error('[Messenger] Failed to send image:', err);
        return { error: err };
    }
}

// ======================================================
// إرسال مجموعة صور متتالية للماسنجر
// ======================================================
export async function sendMessengerImages(recipientId, images, accessToken) {
    if (!Array.isArray(images) || images.length === 0) return;
    for (let i = 0; i < images.length; i++) {
        await sendMessengerImage(recipientId, images[i], accessToken);
        if (i < images.length - 1) {
            await new Promise(r => setTimeout(r, 1200)); // فاصل ثانية بين كل صورة
        }
    }
}

// ======================================================
// إرسال رسالة خاصة رداً على كومنت
// ======================================================
async function sendPrivateReplyToComment(commentId, text, accessToken) {
    try {
        const response = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { comment_id: commentId },
                message: { text: text.substring(0, 2000) }
            })
        });

        const data = await response.json();
        if (data.error) {
            console.error('[Messenger] Private Reply Error:', data.error);
        } else {
            console.log(`✅ [Messenger] Private reply sent for comment ${commentId}`);
        }
        return data;
    } catch (err) {
        console.error('[Messenger] Failed to send private reply:', err);
        return { error: err };
    }
}

// ======================================================
// إرسال حالة أكشن للماسنجر (مثل typing_on)
// ======================================================
async function sendMessengerAction(recipientId, action, accessToken) {
    try {
        await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                sender_action: action
            })
        });
    } catch (err) {
        console.error(`[Messenger] Failed to send action ${action}:`, err);
    }
}

// ======================================================
// عمل ملخص للمحادثة بالـ AI
// ======================================================
export async function generateConversationSummary(userId, conversationId) {
    try {
        const messages = await Message.findAll({
            where: { UserId: userId, remoteJid: conversationId },
            order: [['createdAt', 'ASC']]
        });

        if (messages.length === 0) return null;

        const conversationText = messages.map(msg =>
            `${msg.role === 'user' ? 'العميل' : 'البوت'}: ${msg.content}`
        ).join('\n');

        const url = CONFIG.getVertexUrl ? CONFIG.getVertexUrl() : `https://aiplatform.googleapis.com/v1/projects/${CONFIG.PROJECT_ID}/locations/global/publishers/google/models/${CONFIG.MODEL_NAME}:generateContent`;
        const auth = new GoogleAuth({
            keyFilename: CONFIG.GOOGLE_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'fast-order-505012-2adde4c0badf.json',
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
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{
                        text: `اعمل ملخص قصير (3-5 أسطر) لهذه المحادثة مع العميل، اذكر ما طلبه العميل وكيف تم الرد:
${conversationText}`
                    }]
                }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
            })
        });

        const data = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || null;

        // احفظ الملخص في قاعدة البيانات
        if (summary) {
            const convId = conversationId.split('_').slice(2).join('_'); // senderId
            await MessengerConversation.update(
                { summary },
                { where: { senderId: convId } }
            );
        }

        return summary;
    } catch (err) {
        console.error('[Messenger] Summary Error:', err);
        return null;
    }
}

// ======================================================
// API Routes للداشبورد
// ======================================================

// جلب كل الصفحات المربوطة للمستخدم مع حسابات الأدمن التابعة لها والحسابات الرئيسية بالأعلى
export async function getPages(req, res) {
    try {
        const pages = await MessengerPage.findAll({
            where: { UserId: req.user.id },
            include: [{
                model: MessengerPageAccount,
                as: 'accounts',
                required: false
            }]
        });

        // جلب قائمة الحسابات الشخصية / مستخدمي النظام المميزين للأعلى
        const allAccounts = await MessengerPageAccount.findAll({
            where: { UserId: req.user.id }
        });

        const accountsMap = new Map();
        for (const acc of allAccounts) {
            const key = acc.fbUserId;
            if (!accountsMap.has(key)) {
                accountsMap.set(key, {
                    id: acc.id,
                    fbUserId: acc.fbUserId,
                    fbUserName: acc.fbUserName,
                    fbUserPicture: acc.fbUserPicture,
                    isSystemUser: Boolean(acc.isSystemUser),
                    status: acc.status,
                    isActive: acc.isActive,
                    lastError: acc.lastError,
                    pagesCount: 0,
                    pagesNames: []
                });
            }
            const item = accountsMap.get(key);
            item.pagesCount++;
            if (acc.pageName && !item.pagesNames.includes(acc.pageName)) {
                item.pagesNames.push(acc.pageName);
            }
            if (acc.status === 'checkpoint') item.status = 'checkpoint';
            if (!acc.isActive) item.isActive = false;
        }

        const connectedAccounts = Array.from(accountsMap.values());

        res.json({ success: true, pages, connectedAccounts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// دالة مساعدة لتفعيل الـ Webhook للصفحة
async function subscribePageWebhook(pageId, accessToken, pageName) {
    try {
        const subscribeRes = await fetch(
            `https://graph.facebook.com/v18.0/${pageId}/subscribed_apps`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscribed_fields: ['messages', 'messaging_postbacks', 'feed'],
                    access_token: accessToken
                })
            }
        );
        const subscribeData = await subscribeRes.json();
        if (subscribeData.success) {
            console.log(`[Messenger Webhook] ✅ Subscribed page: ${pageName || pageId}`);
            return true;
        } else {
            console.error(`[Messenger Webhook] ⚠️ Failed to subscribe page ${pageId}:`, subscribeData.error);
            return false;
        }
    } catch (subErr) {
        console.error(`[Messenger Webhook] ⚠️ Error subscribing page ${pageId}:`, subErr);
        return false;
    }
}

// ربط صفحة جديدة يدوي
export async function connectPage(req, res) {
    try {
        const { pageId, pageName, accessToken } = req.body;
        if (!pageId || !pageName || !accessToken) {
            return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
        }

        const [page, created] = await MessengerPage.findOrCreate({
            where: { pageId },
            defaults: { UserId: req.user.id, pageName, pageId, accessToken, isActive: true }
        });

        if (!created) {
            // لو موجودة قبل كده، حدّثها
            await page.update({ pageName, accessToken, isActive: true });
        }

        // احفظ أو حدّث الحساب في جدول حسابات الأدمن
        let fbUserId = `manual_${pageId}`;
        let fbUserName = pageName;
        let fbUserPicture = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        try {
            const meRes = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${accessToken}&fields=id,name,picture.type(large)`);
            const meData = await meRes.json();
            if (meData && meData.id) {
                fbUserId = meData.id;
                fbUserName = meData.name || pageName;
                if (meData.picture?.data?.url) fbUserPicture = meData.picture.data.url;
            }
        } catch (e) {}

        const [acc, accCreated] = await MessengerPageAccount.findOrCreate({
            where: { pageId, fbUserId },
            defaults: {
                pageId,
                pageName,
                UserId: req.user.id,
                fbUserId,
                fbUserName,
                fbUserPicture,
                accessToken,
                status: 'active',
                isActive: true
            }
        });
        if (!accCreated) {
            await acc.update({ pageName, accessToken, fbUserName, fbUserPicture, status: 'active', isActive: true, lastError: null });
        }

        // 👉 تفعيل الـ Webhook للصفحة
        await subscribePageWebhook(pageId, accessToken, pageName);

        res.json({ success: true, message: `تم ربط صفحة "${pageName}" بنجاح!`, page });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}


function parseUserSettings(userRec) {
    if (!userRec || !userRec.settings) return {};
    let val = userRec.settings;
    while (typeof val === 'string') {
        try {
            val = JSON.parse(val);
        } catch (e) {
            return {};
        }
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
        return { ...val };
    }
    return {};
}

async function saveUserSetting(userRec, key, value) {
    if (!userRec) return;
    const settings = parseUserSettings(userRec);
    settings[key] = value;
    await userRec.update({ settings });
}

// الحصول على التوكن المحفوظ لمستخدم النظام
export async function getSavedSystemToken(req, res) {
    try {
        const userRec = await User.findByPk(req.user.id);
        const settings = parseUserSettings(userRec);
        let token = settings.systemUserToken || '';
        if (!token) {
            const p = await MessengerPage.findOne({ where: { UserId: req.user.id, isSystemUser: true } });
            if (p && p.accessToken) token = p.accessToken;
            else token = 'EAAGpjUD5m1cBSPqtXiZCVg1LZCIezNBS9mi9R0UIgdzT8JGBIVIvUHoG2wMUD3ytFI16BofhgZC8TTuYWLZBzTCZAxNUGFBI7vZApQera8V5pOEjhzzazVf92RZChOcQZA8N730CJ3vsy7pGt1ETqixKAr507pZBy3mjCO5eRKK4bnZByiMwcZCDVIDWYU8wI0K3AFgRAZDZD';
            if (token && userRec) await saveUserSetting(userRec, 'systemUserToken', token);
        }
        res.json({
            success: true,
            hasToken: Boolean(token),
            token: token || '',
            maskedToken: token ? `${token.substring(0, 8)}...${token.substring(token.length - 6)}` : ''
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
}

// ربط صفحات باستخدام System User Token أو Page Access Token دائم
export async function connectWithSystemToken(req, res) {
    try {
        const { accessToken } = req.body;
        if (!accessToken || !accessToken.trim()) {
            return res.status(400).json({ success: false, message: 'يرجى إدخال رمز الوصول (Access Token)' });
        }

        const token = accessToken.trim();
        const userId = req.user.id;
        const userRec = await User.findByPk(userId);
        const savedPages = [];

        // 1. فحص هل هو System User / User Token فيه صفحات (/me/accounts)
        let accountsRes = await fetch(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${token}&fields=id,name,access_token,instagram_business_account{id,username}`
        );
        let accountsData = await accountsRes.json();

        if (accountsData.data && accountsData.data.length > 0) {
            for (const page of accountsData.data) {
                const igAccount = page.instagram_business_account;
                const igId = igAccount ? igAccount.id : null;
                const igUsername = igAccount ? igAccount.username : null;
                const pageToken = page.access_token || token;

                const [record, created] = await MessengerPage.findOrCreate({
                    where: { pageId: page.id },
                    defaults: {
                        UserId: userId,
                        pageId: page.id,
                        pageName: page.name,
                        accessToken: pageToken,
                        instagramId: igId,
                        instagramUsername: igUsername,
                        isSystemUser: true,
                        isActive: true
                    }
                });

                if (!created) {
                    const updateData = {
                        pageName: page.name,
                        accessToken: pageToken,
                        UserId: userId,
                        isSystemUser: true,
                        isActive: true
                    };
                    if (igId) updateData.instagramId = igId;
                    if (igUsername) updateData.instagramUsername = igUsername;
                    await record.update(updateData);
                }

                // حفظ أو تحديث الحساب في MessengerPageAccount
                const sysUserId = `sys_${page.id}`;
                const sysUserName = `مستخدم نظام (${page.name})`;
                const sysUserPic = 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png';
                const [acc, accCreated] = await MessengerPageAccount.findOrCreate({
                    where: { pageId: page.id, fbUserId: sysUserId },
                    defaults: {
                        pageId: page.id,
                        pageName: page.name,
                        UserId: userId,
                        fbUserId: sysUserId,
                        fbUserName: sysUserName,
                        fbUserPicture: sysUserPic,
                        accessToken: pageToken,
                        status: 'active',
                        isActive: true,
                        isSystemUser: true
                    }
                });
                if (!accCreated) {
                    await acc.update({ pageName: page.name, accessToken: pageToken, status: 'active', isActive: true, lastError: null });
                }

                await subscribePageWebhook(page.id, pageToken, page.name);
                savedPages.push(page.name);
            }

            // حفظ التوكن بأمان في إعدادات المستخدم
            await saveUserSetting(userRec, 'systemUserToken', token);

            return res.json({
                success: true,
                message: `✅ تم ربط ${savedPages.length} صفحة بنجاح بتوكن دائم: (${savedPages.join(', ')})`,
                count: savedPages.length
            });
        }

        // 2. إذا لم يكن هناك صفحات في /me/accounts، نستعلم عن هوية صاحب التوكن بحقول أساسية فقط (id, name)
        let meRes = await fetch(
            `https://graph.facebook.com/v18.0/me?access_token=${token}&fields=id,name`
        );
        let meData = await meRes.json();

        if (meData.id && meData.name) {
            // نتحقق هل التوكن يخص صفحة مباشرة عبر فحص الـ subscribed_apps
            const subCheck = await fetch(`https://graph.facebook.com/v18.0/me/subscribed_apps?access_token=${token}`);
            if (subCheck.status === 200) {
                // التوكن يتبع صفحة فيسبوك مباشرة
                let igRes = await fetch(
                    `https://graph.facebook.com/v18.0/me?access_token=${token}&fields=instagram_business_account{id,username}`
                );
                let igData = await igRes.json();
                const igAccount = igData.instagram_business_account;
                const igId = igAccount ? igAccount.id : null;
                const igUsername = igAccount ? igAccount.username : null;

                const [record, created] = await MessengerPage.findOrCreate({
                    where: { pageId: meData.id },
                    defaults: {
                        UserId: userId,
                        pageId: meData.id,
                        pageName: meData.name,
                        accessToken: token,
                        instagramId: igId,
                        instagramUsername: igUsername,
                        isSystemUser: true,
                        isActive: true
                    }
                });

                if (!created) {
                    const updateData = {
                        pageName: meData.name,
                        accessToken: token,
                        UserId: userId,
                        isSystemUser: true,
                        isActive: true
                    };
                    if (igId) updateData.instagramId = igId;
                    if (igUsername) updateData.instagramUsername = igUsername;
                    await record.update(updateData);
                }

                // حفظ أو تحديث الحساب في MessengerPageAccount
                const sysUserId = `sys_${meData.id}`;
                const sysUserName = `مستخدم نظام (${meData.name})`;
                const sysUserPic = 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png';
                const [acc, accCreated] = await MessengerPageAccount.findOrCreate({
                    where: { pageId: meData.id, fbUserId: sysUserId },
                    defaults: {
                        pageId: meData.id,
                        pageName: meData.name,
                        UserId: userId,
                        fbUserId: sysUserId,
                        fbUserName: sysUserName,
                        fbUserPicture: sysUserPic,
                        accessToken: token,
                        status: 'active',
                        isActive: true,
                        isSystemUser: true
                    }
                });
                if (!accCreated) {
                    await acc.update({ pageName: meData.name, accessToken: token, status: 'active', isActive: true, lastError: null });
                }

                await subscribePageWebhook(meData.id, token, meData.name);
                await saveUserSetting(userRec, 'systemUserToken', token);

                return res.json({
                    success: true,
                    message: `✅ تم ربط صفحة "${meData.name}" بنجاح بتوكن دائم!`,
                    page: meData
                });
            }

            // إذا لم يكن صفحة، فهو مستخدم نظام (System User) مثل Rady ولكن لم يتم إسناد أي صفحات له بعد في Business Manager
            return res.status(400).json({
                success: false,
                message: `⚠️ التوكن سليم ويتبع (${meData.name})، ولكن لا توجد أي صفحات مسندة له حالياً في مدير الأعمال! يرجى إسناد الصفحة لـ ${meData.name} أولاً من إعدادات الأعمال.`
            });
        }

        const errMsg = accountsData.error?.message || meData.error?.message || 'التوكن غير صالح أو تنقصه الصلاحيات المطلوبة.';
        return res.status(400).json({
            success: false,
            message: `❌ خطأ من فيسبوك: ${errMsg}`
        });

    } catch (err) {
        console.error('[System User Connect] Error:', err);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة التوكن: ' + err.message });
    }
}

// مزامنة الصفحات المسندة لمستخدم النظام تلقائياً بالتوكن المحفوظ
export async function syncSystemPages(req, res) {
    try {
        const userId = req.user.id;
        const userRec = await User.findByPk(userId);
        const userSettings = parseUserSettings(userRec);
        let token = userSettings.systemUserToken;

        // إذا لم يكن مخزناً في settings، نجلب التوكن من صفحة قديمة أو التوكن الثابت
        if (!token) {
            const pageWithToken = await MessengerPage.findOne({ where: { UserId: userId, isSystemUser: true } });
            if (pageWithToken && pageWithToken.accessToken) {
                token = pageWithToken.accessToken;
            } else {
                token = 'EAAGpjUD5m1cBSPqtXiZCVg1LZCIezNBS9mi9R0UIgdzT8JGBIVIvUHoG2wMUD3ytFI16BofhgZC8TTuYWLZBzTCZAxNUGFBI7vZApQera8V5pOEjhzzazVf92RZChOcQZA8N730CJ3vsy7pGt1ETqixKAr507pZBy3mjCO5eRKK4bnZByiMwcZCDVIDWYU8wI0K3AFgRAZDZD';
            }
            await saveUserSetting(userRec, 'systemUserToken', token);
        }

        const accountsRes = await fetch(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${token}&fields=id,name,access_token,instagram_business_account{id,username}`
        );
        const accountsData = await accountsRes.json();

        if (!accountsData.data || accountsData.data.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'لم يتم العثور على أي صفحات مسندة لمستخدم النظام حالياً. تأكد من إسناد الصفحة له في مدير الأعمال أولاً.'
            });
        }

        const allPages = [];
        const newPages = [];
        const existingPages = [];

        for (const page of accountsData.data) {
            allPages.push(page.name);
            const igAccount = page.instagram_business_account;
            const igId = igAccount ? igAccount.id : null;
            const igUsername = igAccount ? igAccount.username : null;
            const pageToken = page.access_token || token;

            const [record, created] = await MessengerPage.findOrCreate({
                where: { pageId: page.id },
                defaults: {
                    UserId: userId,
                    pageId: page.id,
                    pageName: page.name,
                    accessToken: pageToken,
                    instagramId: igId,
                    instagramUsername: igUsername,
                    isSystemUser: true,
                    isActive: true
                }
            });

            if (created) {
                newPages.push(page.name);
            } else {
                existingPages.push(page.name);
                const updateData = {
                    pageName: page.name,
                    accessToken: pageToken,
                    UserId: userId,
                    isSystemUser: true,
                    isActive: true
                };
                if (igId) updateData.instagramId = igId;
                if (igUsername) updateData.instagramUsername = igUsername;
                await record.update(updateData);
            }

            // حفظ أو تحديث الحساب في MessengerPageAccount
            const sysUserId = `sys_${page.id}`;
            const sysUserName = `مستخدم نظام (${page.name})`;
            const sysUserPic = 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png';
            const [acc, accCreated] = await MessengerPageAccount.findOrCreate({
                where: { pageId: page.id, fbUserId: sysUserId },
                defaults: {
                    pageId: page.id,
                    pageName: page.name,
                    UserId: userId,
                    fbUserId: sysUserId,
                    fbUserName: sysUserName,
                    fbUserPicture: sysUserPic,
                    accessToken: pageToken,
                    status: 'active',
                    isActive: true,
                    isSystemUser: true
                }
            });
            if (!accCreated) {
                await acc.update({ pageName: page.name, accessToken: pageToken, status: 'active', isActive: true, lastError: null });
            }

            await subscribePageWebhook(page.id, pageToken, page.name);
        }

        // صياغة رسالة واضحة جداً ودقيقة للمستخدم
        let replyMsg = '';
        if (newPages.length > 0) {
            replyMsg = `✅ تمت المزامنة بنجاح! تم إضافة ${newPages.length} صفحة جديدة: (${newPages.join('، ')})، وإجمالي الصفحات المربوطة حالياً ${allPages.length}: (${allPages.join('، ')}).`;
        } else {
            replyMsg = `✅ جميع الصفحات (${allPages.length}) مضافة ومحدثة بالفعل: (${allPages.join('، ')}). لا توجد صفحات جديدة مسندة في مدير الأعمال.`;
        }

        return res.json({
            success: true,
            message: replyMsg,
            count: allPages.length,
            newCount: newPages.length,
            newPages,
            existingPages,
            pages: allPages
        });

    } catch (err) {
        console.error('[Sync System Pages] Error:', err);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء المزامنة: ' + err.message });
    }
}


export async function disconnectPage(req, res) {
    try {
        const { pageId } = req.params;
        await MessengerPage.destroy({ where: { pageId, UserId: req.user.id } });
        await MessengerPageAccount.destroy({ where: { pageId, UserId: req.user.id } });
        res.json({ success: true, message: 'تم إلغاء ربط الصفحة وحساباتها' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// تحديث الرد التلقائي لصفحة
export async function updatePageComment(req, res) {
    try {
        const { pageId } = req.params;
        const { defaultComment } = req.body;
        await MessengerPage.update(
            { defaultComment },
            { where: { pageId, UserId: req.user.id } }
        );
        res.json({ success: true, message: 'تم تحديث الرد التلقائي بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// تحديث إعدادات نظام الرد (replyMode + fixedReply)
export async function updatePageSettings(req, res) {
    try {
        const { pageId } = req.params;
        const { 
            replyMode, 
            fixedReply, 
            useButtonsWithFixedReply, 
            replyToMessagesWithFixed, 
            replyToIgMessagesWithFixed,
            fixedReplyImages 
        } = req.body;

        if (!['ai', 'fixed'].includes(replyMode)) {
            return res.status(400).json({ success: false, message: 'نظام الرد غير صحيح' });
        }

        if (replyMode === 'fixed' && !fixedReply?.trim()) {
            return res.status(400).json({ success: false, message: 'يجب كتابة الرد الثابت أولاً' });
        }

        const updateData = {
            replyMode,
            fixedReply: fixedReply?.trim() || null
        };

        if (typeof useButtonsWithFixedReply !== 'undefined') {
            updateData.useButtonsWithFixedReply = Boolean(useButtonsWithFixedReply);
        }
        if (typeof replyToMessagesWithFixed !== 'undefined') {
            updateData.replyToMessagesWithFixed = Boolean(replyToMessagesWithFixed);
        }
        if (typeof replyToIgMessagesWithFixed !== 'undefined') {
            updateData.replyToIgMessagesWithFixed = Boolean(replyToIgMessagesWithFixed);
        }
        if (typeof fixedReplyImages !== 'undefined') {
            updateData.fixedReplyImages = Array.isArray(fixedReplyImages) ? JSON.stringify(fixedReplyImages) : (typeof fixedReplyImages === 'string' ? fixedReplyImages : null);
        }

        await MessengerPage.update(
            updateData,
            { where: { pageId, UserId: req.user.id } }
        );

        const modeText = replyMode === 'ai' ? 'ذكاء اصطناعي' : 'رد ثابت';
        res.json({ success: true, message: `تم حفظ وتفعيل إعدادات الـ ${modeText} بنجاح` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// حذف ربط جميع الصفحات
export async function disconnectAllPages(req, res) {
    try {
        await MessengerPage.destroy({ where: { UserId: req.user.id } });
        await MessengerPageAccount.destroy({ where: { UserId: req.user.id } });
        res.json({ success: true, message: 'تم إلغاء ربط جميع الصفحات وحساباتها بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// جلب المحادثات لصفحة معينة
export async function getConversations(req, res) {
    try {
        const { pageId } = req.params;
        const conversations = await MessengerConversation.findAll({
            where: { pageId, UserId: req.user.id },
            order: [['lastMessageAt', 'DESC']],
            limit: 50
        });
        res.json({ success: true, conversations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// جيب محادثة وعمل ملخص لها
export async function getSummary(req, res) {
    try {
        const { conversationId } = req.params;
        const summary = await generateConversationSummary(req.user.id, conversationId);
        res.json({ success: true, summary });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ======================================================
// Facebook OAuth - ابدأ عملية تسجيل الدخول بفيسبوك
// ======================================================
export function startFacebookAuth(req, res) {
    const appId = process.env.FB_APP_ID;
    const redirectUri = encodeURIComponent(process.env.FB_REDIRECT_URI);
    const scopes = [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_metadata',
        'pages_messaging',
        'pages_manage_engagement',
        'instagram_basic',
        'instagram_manage_messages',
        'instagram_manage_comments'
    ].join(',');

    // نحفظ الـ userId في الـ session عشان نستخدمه بعد الـ callback
    req.session.fbAuthUserId = req.user.id;

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code`;
    res.redirect(authUrl);
}

// ======================================================
// Facebook OAuth - استقبال الـ callback بعد موافقة اليوزر
// ======================================================
export async function handleFacebookCallback(req, res) {
    const { code, error } = req.query;

    // لو اليوزر رفض أو حصل خطأ
    if (error || !code) {
        console.error('[Facebook OAuth] Error or denied:', error);
        return res.redirect('/dashboard/messenger?error=facebook_denied');
    }

    try {
        const appId = process.env.FB_APP_ID;
        const appSecret = process.env.FB_APP_SECRET;
        const redirectUri = encodeURIComponent(process.env.FB_REDIRECT_URI);
        const userId = req.session.fbAuthUserId || req.user?.id;

        if (!userId) {
            return res.redirect('/login');
        }

        // الخطوة 1: استبدل الـ code بـ User Access Token
        const tokenRes = await fetch(
            `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&redirect_uri=${redirectUri}&client_secret=${appSecret}&code=${code}`
        );
        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            console.error('[Facebook OAuth] Failed to get token:', tokenData);
            return res.redirect('/dashboard/messenger?error=token_failed');
        }

        const userToken = tokenData.access_token;
        console.log('[Facebook OAuth] ✅ Got user access token');

        // الخطوة 2: جيب كل الصفحات اللي عند اليوزر وحسابات الإنستجرام المرتبطة بها
        const pagesRes = await fetch(
            `https://graph.facebook.com/v18.0/me/accounts?access_token=${userToken}&fields=id,name,access_token,instagram_business_account{id,username}`
        );
        const pagesData = await pagesRes.json();

        if (!pagesData.data || pagesData.data.length === 0) {
            console.log('[Facebook OAuth] No pages found for user');
            return res.redirect('/dashboard/messenger?error=no_pages');
        }

        console.log(`[Facebook OAuth] Found ${pagesData.data.length} pages`);

        // جلب بيانات الحساب الشخصي الذي سجل الدخول
        let fbUserId = 'unknown';
        let fbUserName = 'حساب فيسبوك';
        let fbUserPicture = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        try {
            const meRes = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${userToken}&fields=id,name,picture.type(large)`);
            const meData = await meRes.json();
            if (meData && meData.id) {
                fbUserId = meData.id;
                fbUserName = meData.name || 'حساب فيسبوك';
                if (meData.picture?.data?.url) fbUserPicture = meData.picture.data.url;
            }
            console.log(`[Facebook OAuth] ✅ Logged in as FB user: ${fbUserName} (${fbUserId})`);
        } catch (meErr) {
            console.error('[Facebook OAuth] Failed to get user profile:', meErr);
        }

        // الخطوة 3: احفظ كل صفحة في DB
        let savedCount = 0;
        for (const page of pagesData.data) {
            try {
                const igAccount = page.instagram_business_account;
                const igId = igAccount ? igAccount.id : null;
                const igUsername = igAccount ? igAccount.username : null;

                const [record, created] = await MessengerPage.findOrCreate({
                    where: { pageId: page.id },
                    defaults: {
                        UserId: userId,
                        pageId: page.id,
                        pageName: page.name,
                        accessToken: page.access_token,
                        instagramId: igId,
                        instagramUsername: igUsername,
                        isActive: true
                    }
                });

                if (!created) {
                    // حدّث الـ token لو الصفحة موجودة وحساب الإنستجرام
                    const updateData = {
                        pageName: page.name,
                        accessToken: page.access_token,
                        UserId: userId,
                        isActive: true
                    };
                    if (igId) updateData.instagramId = igId;
                    if (igUsername) updateData.instagramUsername = igUsername;
                    await record.update(updateData);
                }

                // حفظ أو تحديث الحساب في MessengerPageAccount لربط أكثر من أدمن
                const [acc, accCreated] = await MessengerPageAccount.findOrCreate({
                    where: { pageId: page.id, fbUserId },
                    defaults: {
                        pageId: page.id,
                        pageName: page.name,
                        UserId: userId,
                        fbUserId,
                        fbUserName,
                        fbUserPicture,
                        accessToken: page.access_token,
                        status: 'active',
                        isActive: true,
                        isSystemUser: false
                    }
                });
                if (!accCreated) {
                    await acc.update({
                        pageName: page.name,
                        accessToken: page.access_token,
                        fbUserName,
                        fbUserPicture,
                        status: 'active',
                        isActive: true,
                        lastError: null
                    });
                }
                console.log(`[Facebook OAuth] ✅ Linked admin "${fbUserName}" to page "${page.name}"`);

                // 👉 تفعيل الـ Webhook للصفحة عشان يتبعت لنا الرسائل والكومنتات
                try {
                    const subscribeRes = await fetch(
                        `https://graph.facebook.com/v18.0/${page.id}/subscribed_apps`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                subscribed_fields: ['messages', 'messaging_postbacks', 'feed'],
                                access_token: page.access_token
                            })
                        }
                    );
                    const subscribeData = await subscribeRes.json();
                    if (subscribeData.success) {
                        console.log(`[Facebook OAuth] ✅ Subscribed to webhooks (messages + feed) for page: ${page.name}`);
                    } else {
                        console.error(`[Facebook OAuth] ⚠️ Failed to subscribe webhook for page ${page.id}:`, subscribeData.error);
                    }
                } catch (subErr) {
                    console.error(`[Facebook OAuth] ⚠️ Error subscribing webhook for page ${page.id}:`, subErr);
                }

                savedCount++;
                console.log(`[Facebook OAuth] ✅ Saved page: ${page.name} (${page.id})`);
            } catch (e) {
                console.error(`[Facebook OAuth] Failed to save page ${page.id}:`, e);
            }
        }

        // امسح الـ session variable
        delete req.session.fbAuthUserId;

        // ارجع للداشبورد مع رسالة نجاح
        res.redirect(`/dashboard/messenger?success=${savedCount}`);

    } catch (err) {
        console.error('[Facebook OAuth] Callback Error:', err);
        res.redirect('/dashboard/messenger?error=server_error');
    }
}

// ======================================================
// دوال إدارة حسابات الأدمن المتعددة للصفحات (Multi-Account)
// ======================================================

// 1. تفعيل أو إيقاف حساب مؤقتاً
export async function togglePageAccount(req, res) {
    try {
        const { accountId } = req.params;
        const account = await MessengerPageAccount.findOne({
            where: { id: accountId, UserId: req.user.id }
        });
        if (!account) return res.status(404).json({ success: false, message: 'الحساب غير موجود' });

        const newIsActive = !account.isActive;
        const newStatus = newIsActive ? (account.status === 'paused' ? 'active' : account.status) : 'paused';
        await account.update({ isActive: newIsActive, status: newStatus });

        res.json({
            success: true,
            isActive: newIsActive,
            status: newStatus,
            message: newIsActive ? `✅ تم تفعيل الحساب "${account.fbUserName}" بنجاح` : `⏸️ تم إيقاف الحساب "${account.fbUserName}" مؤقتاً`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// 2. حذف حساب من الصفحة
export async function deletePageAccount(req, res) {
    try {
        const { accountId } = req.params;
        const account = await MessengerPageAccount.findOne({
            where: { id: accountId, UserId: req.user.id }
        });
        if (!account) return res.status(404).json({ success: false, message: 'الحساب غير موجود' });

        const name = account.fbUserName;
        await account.destroy();
        res.json({ success: true, message: `🗑️ تم إزالة الحساب "${name}" من الصفحة بنجاح` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// 3. فحص حالة الرمز في الوقت الفعلي
export async function checkPageAccountStatus(req, res) {
    try {
        const { accountId } = req.params;
        const account = await MessengerPageAccount.findOne({
            where: { id: accountId, UserId: req.user.id }
        });
        if (!account) return res.status(404).json({ success: false, message: 'الحساب غير موجود' });

        const testRes = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${account.accessToken}&fields=id,name`);
        const testData = await testRes.json();

        if (testData.error) {
            const errStr = JSON.stringify(testData.error);
            const isCp = errStr.includes('checkpoint') || testData.error.error_subcode === 459 || errStr.includes('You cannot access the app');
            const status = isCp ? 'checkpoint' : 'error';
            const errorMsg = isCp ? 'الحساب محظور (سيلفي / تأكيد هوية في فيسبوك)' : (testData.error.message || 'خطأ في الرمز');
            await account.update({ status, lastError: errorMsg });
            return res.json({
                success: false,
                status,
                message: isCp ? '⚠️ الحساب محظور حالياً (مطلوب سيلفي أو تأكيد هوية في فيسبوك) لفتحه' : `⚠️ ${errorMsg}`
            });
        }

        await account.update({ status: 'active', lastError: null });
        res.json({ success: true, status: 'active', message: `✅ الحساب "${account.fbUserName}" شغال تمام والرمز صالح بدون مشاكل` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// 4. إضافة توكن حساب يدوي للصفحة
export async function addPageAccountManual(req, res) {
    try {
        const { pageId } = req.params;
        const { accessToken } = req.body;
        if (!accessToken || !accessToken.trim()) {
            return res.status(400).json({ success: false, message: 'يرجى إدخال رمز الوصول (Token)' });
        }

        const token = accessToken.trim();
        const page = await MessengerPage.findOne({ where: { pageId, UserId: req.user.id } });
        if (!page) return res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });

        // فحص التوكن وجلب هوية صاحب التوكن
        const meRes = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${token}&fields=id,name,picture.type(large)`);
        const meData = await meRes.json();

        if (meData.error) {
            return res.status(400).json({ success: false, message: `فشل التحقق من الرمز: ${meData.error.message}` });
        }

        const fbUserId = meData.id;
        const fbUserName = meData.name || 'حساب فيسبوك';
        const fbUserPicture = meData.picture?.data?.url || null;

        const [acc, created] = await MessengerPageAccount.findOrCreate({
            where: { pageId, fbUserId },
            defaults: {
                pageId,
                pageName: page.pageName,
                UserId: req.user.id,
                fbUserId,
                fbUserName,
                fbUserPicture,
                accessToken: token,
                status: 'active',
                isActive: true,
                isSystemUser: false
            }
        });

        if (!created) {
            await acc.update({
                accessToken: token,
                fbUserName,
                fbUserPicture,
                status: 'active',
                isActive: true,
                lastError: null
            });
        }

        // اشتراك الـ Webhook بالتوكن الجديد
        await subscribePageWebhook(pageId, token, page.pageName);

        res.json({
            success: true,
            message: `✅ تم ربط الحساب "${fbUserName}" بالصفحة بنجاح!`,
            account: acc
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ======================================================
// إدارة الحسابات المربوطة بالأعلى (FB User Master Actions)
// ======================================================

// فحص حالة الحساب من فيسبوك وتحديث وضعه في كل الصفحات
export async function checkFbUserStatus(req, res) {
    try {
        const { fbUserId } = req.params;
        const accounts = await MessengerPageAccount.findAll({
            where: { UserId: req.user.id, fbUserId }
        });

        if (!accounts || accounts.length === 0) {
            return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
        }

        const sample = accounts[0];
        const token = sample.accessToken;

        let newStatus = 'active';
        let errorMsg = null;
        let newName = sample.fbUserName;
        let newPic = sample.fbUserPicture;

        try {
            const fbRes = await fetch(`https://graph.facebook.com/v18.0/me?access_token=${token}&fields=id,name,picture.type(large)`);
            const fbData = await fbRes.json();
            if (fbData.error) {
                const code = fbData.error.code;
                const subcode = fbData.error.error_subcode;
                if (code === 190 || subcode === 459 || subcode === 460 || subcode === 463 || subcode === 467) {
                    newStatus = 'checkpoint';
                } else {
                    newStatus = 'error';
                }
                errorMsg = fbData.error.message;
            } else {
                newStatus = 'active';
                if (fbData.name) newName = fbData.name;
                if (fbData.picture?.data?.url) newPic = fbData.picture.data.url;
            }
        } catch (netErr) {
            newStatus = 'error';
            errorMsg = netErr.message;
        }

        // تحديث جميع السجلات التابعة لهذا المستخدم
        await MessengerPageAccount.update(
            {
                status: newStatus,
                lastError: errorMsg,
                fbUserName: newName,
                fbUserPicture: newPic
            },
            { where: { UserId: req.user.id, fbUserId } }
        );

        res.json({
            success: true,
            status: newStatus,
            message: newStatus === 'active' ? '✅ الحساب شغال وسليم 100%' : `⚠️ تنبيه للحساب: ${errorMsg || newStatus}`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// إيقاف أو تفعيل الحساب لجميع الصفحات التابع لها
export async function toggleFbUser(req, res) {
    try {
        const { fbUserId } = req.params;
        const accounts = await MessengerPageAccount.findAll({
            where: { UserId: req.user.id, fbUserId }
        });

        if (!accounts || accounts.length === 0) {
            return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
        }

        const currentActive = accounts[0].isActive;
        const newActive = !currentActive;

        await MessengerPageAccount.update(
            { isActive: newActive },
            { where: { UserId: req.user.id, fbUserId } }
        );

        res.json({
            success: true,
            isActive: newActive,
            message: newActive ? 'تم تفعيل الحساب لجميع الصفحات' : 'تم إيقاف الحساب مؤقتاً لجميع الصفحات'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// حذف وإلغاء ربط الحساب من جميع الصفحات
export async function deleteFbUser(req, res) {
    try {
        const { fbUserId } = req.params;
        const deleted = await MessengerPageAccount.destroy({
            where: { UserId: req.user.id, fbUserId }
        });

        res.json({
            success: true,
            message: `تم إلغاء ربط الحساب بنجاح (${deleted} ارتباط)`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
