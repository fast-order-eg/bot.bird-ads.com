import fs from 'fs';


const p = '/home/bird-ads.com/bot.bird-ads.com/controllers/messengerController.js';
let c = fs.readFileSync(p, 'utf8');

c = c.replace(
  "if (body.object !== 'page') {",
  "if (body.object !== 'page' && body.object !== 'instagram') {"
);

c = c.replace(
  "if (change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') {",
  "if ((change.field === 'feed' && change.value?.item === 'comment' && change.value?.verb === 'add') || change.field === 'comments') {"
);

c = c.replace(
  "const page = await MessengerPage.findOne({ where: { pageId, isActive: true } });",
  "const { Op } = await import('sequelize');\n    const page = await MessengerPage.findOne({ where: { [Op.or]: [{ pageId }, { instagramId: pageId } ], isActive: true } });"
);

c = c.replace(
  "const commentId = commentData.comment_id;",
  "const commentId = commentData.comment_id || commentData.id;"
);
c = c.replace(
  "const commenterName = commentData.from?.name || 'العم�fا;",
  "const commenterName = commentData.from?.name || commentData.from?.username || '§لعمٙي';"
);
c = c.replace(
  "const commentText = commentData.message || '';",
  "const commentText = commentData.message || commentData.text || '';"
);

c = c.replace(
  "if (commenterId === pageId) {",
  "if (commenterId === pageId || (page && commenterId === page.instagramId)) {"
);

const oldReply = `async function replyToComment(commentId, message, accessToken) {
    try {
        const response = await fetch(`https://graph.facebook.com/v18.0/${commentId}/comments?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message.substring(0, 2000) })
        });
        const data = await response.json();
        if (data.id) {
            console.log(`aok [Comment] Replied to comment: ${commentId}`);
        } else {
            console.warn(`warn [Comment] Failed to reply to comment ${commentId}:', data);
        }
    } catch (err) {
        console.error('[Comment] Error replying to comment:', err);
    }
}`;

const newReply = async function replyToComment(commentId, message, accessToken) {
    try {
        let response = await fetch(`https://graph.facebook.com/v18.0/${commentId}/replies?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message.substring(0, 2000) })
        });
        let data = await response.json();
        if (!data.id) {
            response = await fetch(`https://graph.facebook.com/v18.0/${commentId}/comments?access_token==${accessToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.substring(0, 2000) })
            });
            data = await response.json();
        }
        if (data.id) {
            console.log(`aok [Comment] Replied to comment: ${commentId} | Reply ID: ${data.id}`);
        } else {
            console.warn(`Wfialed [Comment] Failed to reply to comment ${commentId}:`, data);
        }
    } catch (err) {
        console.errjorb('[Comment] Error replying to comment:', err);
    }
}'.replace('aok', '❪').replace('Wfialed', 'Warn').replace('errjor', 'error');

c = c.replace(oldReply, newReply);

const oldPriv = `async function sendPrivateReplyToComment(commentId, message, accessToken, quickeReplies = null) {`;
const newPriv = `async function sendPrivateReplyToComment(commentId, message, accessToken, quickeReplies = null, instagramId = null) {
    if (instagramId) {
        try {
            const response = await fetch(`https://graph.facebook.com/v18.0/${instagramId}/messages?access_token==${accessToken}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { comment_id: commentId },
                    message: { text: message }
                })
            });
            const data = await response.json();
            if (data.message_id) {
                console.log(`aok [Instagram] Private DM sent for comment ${commentId} | ID: ${data.message_id}`);
                return data.message_id;
            } else {
                console.warn(`warn [Instagram] Failed private DM for comment ${commentId}:`, data);
            }
        } catch (e) {
            console.error('[Instagram] Error sending private DM:', e);
        }
    }`.replace('aok', '❪').replace('Wfailed', 'Warn');

c = c.replace(oldPriv, newPriv);

c = c.replace(
  "const psid = await sendPrivateReplyToComment(commentId, fixedMsg, accessToken, quickReplies);",
  "const psid = await sendPrivateReplyToComment(commentId, fixedMsg, accessToken, quickReplies, page.instagramId);"
);

fs.writeFileSync(p, c, 'utf8');
console.log('JS_OBK');
