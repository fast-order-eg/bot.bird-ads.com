import express from 'express';
import {
    verifyWebhook,
    handleWebhook,
    getPages,
    connectPage,
    disconnectPage,
    getConversations,
    getSummary,
    startFacebookAuth,
    handleFacebookCallback,
    updatePageComment,
    updatePageSettings,
    disconnectAllPages
} from '../controllers/messengerController.js';

const router = express.Router();

// ====== Webhook ======
router.get('/webhook/messenger', verifyWebhook);
router.post('/webhook/messenger', handleWebhook);

// ====== Dashboard Page ======
router.get('/dashboard/messenger', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    res.render('messenger', { user: req.user, page: 'messenger' });
});

// ====== Facebook OAuth ======
router.get('/auth/facebook/messenger', (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    return startFacebookAuth(req, res);
});
router.get('/auth/facebook/messenger/callback', (req, res) => handleFacebookCallback(req, res));

// ====== API Routes ======
router.get('/api/messenger/pages', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false });
    return getPages(req, res);
});
router.post('/api/messenger/connect', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false });
    return connectPage(req, res);
});
router.delete('/api/messenger/page/:pageId', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false });
    return disconnectPage(req, res);
});
// تحديث رد الكومنت
router.put('/api/messenger/page/:pageId', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false });
    return updatePageComment(req, res);
});
// تحديث إعدادات النظام (replyMode + fixedReply)
router.patch('/api/messenger/page/:pageId/settings', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false });
    return updatePageSettings(req, res);
});
router.delete('/api/messenger/pages', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false });
    return disconnectAllPages(req, res);
});
router.get('/api/messenger/conversations/:pageId', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false });
    return getConversations(req, res);
});
router.get('/api/messenger/summary/:conversationId', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false });
    return getSummary(req, res);
});

export default router;
