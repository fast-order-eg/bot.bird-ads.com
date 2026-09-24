import express from 'express';
import { startSession, stopSession, logoutSession, getStatus, getGroups, sendManualMessage, notifyControlGroup } from '../controllers/botController.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import MessengerConversation from '../models/MessengerConversation.js';
import MessengerPage from '../models/MessengerPage.js';
import Campaign from '../models/Campaign.js';
import Instruction from '../models/Instruction.js';
import Product from '../models/Product.js';
import InteractiveButton from '../models/InteractiveButton.js';
import InteractiveMenu from '../models/InteractiveMenu.js';
import { upload, compressAndSaveImage, deleteImage } from '../config/uploadConfig.js';
import { Op, Sequelize } from 'sequelize';

const router = express.Router();

// Middleware to ensure login
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

router.use(isAuthenticated);

router.get('/', async (req, res) => {
    if (req.user.role === 'super_admin') {
        return res.redirect('/admin');
    }
    const freshUser = await User.findByPk(req.user.id);
    const statusResult = await getStatus(req.user.id);
    res.render('user_dashboard', {
        user: freshUser || req.user,
        status: statusResult.status || 'offline',
        phone: statusResult.phone || '',
        page: 'home'
    });
});



router.post('/start-bot', async (req, res) => {
    const io = req.app.get('socketio');
    const result = await startSession(req.user.id, io);
    res.json(result);
});

router.post('/pair-bot', async (req, res) => {
    const { phoneNumber } = req.body;
    const io = req.app.get('socketio');
    const result = await startSession(req.user.id, io, phoneNumber);
    res.json(result);
});

router.post('/stop-bot', async (req, res) => {
    const io = req.app.get('socketio');
    const result = await stopSession(req.user.id, io);
    res.json(result);
});

router.post('/logout-bot', async (req, res) => {
    const io = req.app.get('socketio');
    const result = await logoutSession(req.user.id, io);
    res.json(result);
});

router.get('/groups', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const detailed = req.query.detailed === '1';
        if (detailed) {
            const freshUser = await User.findByPk(req.user.id);
            const result = await getGroups(req.user.id, page, 10, true);
            return res.json({
                ...result,
                selectedGroupJid: freshUser?.control_group_jid || null,
                selectedGroupName: freshUser?.settings?.control_group_name || null
            });
        }
        const groups = await getGroups(req.user.id, page, 10, false);
        res.json(groups);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

router.post('/select-control-group', async (req, res) => {
    try {
        const { groupId, groupName } = req.body;
        if (!groupId) {
            return res.status(400).json({ success: false, error: 'يرجى اختيار جروب صحيح' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        }

        const currentSettings = (user.settings && typeof user.settings === 'object') ? { ...user.settings } : {};
        currentSettings.control_group_name = groupName || 'جروب التحكم المختار';

        user.control_group_jid = groupId;
        user.settings = currentSettings;
        user.changed('settings', true);
        await user.save();

        // Update actionTarget in user's instructions so order summaries also target this group
        if (groupName) {
            await Instruction.update({ actionTarget: groupName }, { where: { UserId: req.user.id } });
        }

        // Send confirmation message inside the selected WhatsApp group
        notifyControlGroup(
            req.user.id,
            `✅ *تم ربط هذا الجروب بنجاح كجروب التحكم والملخصات*\n\nسيتم إرسال جميع طلبات العملاء، وملخصات المحادثات، وإشعارات التدخل البشري إلى هذا الجروب.\n\n💡 يمكنك أيضاً التحكم في البوت من داخل هذا الجروب بإرسال:\n- *ايقاف* أو *stop*\n- *تشغيل* أو *start*\n- *انتظر 15 دقيقة*`
        ).catch(() => {});

        return res.json({
            success: true,
            selectedGroupJid: groupId,
            selectedGroupName: currentSettings.control_group_name
        });
    } catch (err) {
        console.error('Error selecting control group:', err);
        return res.status(500).json({ success: false, error: 'حدث خطأ أثناء حفظ الجروب المختار' });
    }
});

// Instructions CRUD
router.get('/instructions', async (req, res) => {
    try {
        const instructions = await Instruction.findAll({
            where: { 
                UserId: req.user.id,
                type: { [Op.ne]: 'gallery' }
            },
            order: [['order', 'ASC'], ['createdAt', 'DESC']]
        });

        // Groups fetch removed to prevent hanging. Groups can be loaded via AJAX if needed.
        const groups = [];
        res.render('instructions', { user: req.user, page: 'instructions', instructions, groups, success: false });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching instructions");
    }
});

import { analyzeAndSegmentText, generateKeywords } from '../controllers/aiController.js';
import SimulationMessage from '../models/SimulationMessage.js';
import TeachMessage from '../models/TeachMessage.js';
import { simulateChat, teachBot } from '../controllers/botController.js';

router.post('/instructions/add', async (req, res) => {
    try {
        const { clientName, title, content, actionTarget, imageUrl } = req.body;

        console.log("📝 Received instruction data:", { clientName, title, content: content?.substring(0, 50) });

        let keywords = '';
        try {
            console.log("🧠 Generating keywords for instruction...");
            const kwResult = await generateKeywords(content);
            if (kwResult) keywords = kwResult;
        } catch (aiError) {
            console.log("⚠️ Keyword generation failed, saving without AI keywords:", aiError.message);
        }

        await Instruction.create({
            clientName,
            title,
            content,
            actionTarget,
            imageUrl: imageUrl || '',
            UserId: req.user.id,
            keywords: keywords,
            type: 'topic'
        });

        res.redirect('/dashboard/instructions');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding instruction");
    }
});

// Gallery CRUD
router.get('/gallery', async (req, res) => {
    try {
        const instructions = await Instruction.findAll({
            where: { UserId: req.user.id, type: 'gallery' },
            order: [['order', 'ASC'], ['createdAt', 'DESC']]
        });
        const groups = [];
        res.render('gallery', { user: req.user, page: 'gallery', instructions, groups, success: false });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching gallery");
    }
});

router.post('/gallery/add', async (req, res) => {
    try {
        const { clientName, imageUrl } = req.body;

        // AI generates description and keywords automatically
        let autoContent = `منتج/خدمة: ${clientName}`;
        let autoKeywords = clientName;

        try {
            const { generateKeywords } = await import('../controllers/aiController.js');
            const kwResult = await generateKeywords(clientName);
            if (kwResult) autoKeywords = kwResult;
            autoContent = `هذا المنتج/الخدمة: ${clientName}.`;
        } catch (aiErr) {
            console.log('⚠️ AI keyword gen failed, using defaults:', aiErr.message);
        }

        await Instruction.create({
            clientName,
            title: clientName,
            content: autoContent,
            actionTarget: '',
            imageUrl: imageUrl || '',
            UserId: req.user.id,
            keywords: autoKeywords,
            type: 'gallery'
        });

        res.redirect('/dashboard/gallery');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding to gallery");
    }
});

router.post('/gallery/edit', async (req, res) => {
    try {
        const { id, clientName, imageUrl } = req.body;

        await Instruction.update({
            clientName,
            title: clientName,
            imageUrl: imageUrl || ''
        }, { where: { id: id, UserId: req.user.id } });

        res.redirect('/dashboard/gallery');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating gallery");
    }
});

// Delete gallery item
router.post('/gallery/delete', async (req, res) => {
    try {
        await Instruction.destroy({ where: { id: req.body.id, UserId: req.user.id, type: 'gallery' } });
        res.redirect('/dashboard/gallery');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting gallery item");
    }
});


// ============================================================
// 🛍️ Products & Services CRUD
// ============================================================
router.get('/products', async (req, res) => {
    try {
        const typeFilter = req.query.type; // 'product', 'service', or undefined (all)
        const where = { UserId: req.user.id };
        if (typeFilter && ['product', 'service'].includes(typeFilter)) {
            where.type = typeFilter;
        }

        const products = await Product.findAll({
            where,
            order: [['createdAt', 'DESC']]
        });

        res.render('products', {
            user: req.user,
            page: 'products',
            products,
            activeFilter: typeFilter || 'all',
            success: req.query.success === '1'
        });
    } catch (err) {
        console.error('Products page error:', err);
        res.status(500).send("Error fetching products");
    }
});

router.post('/products/add', async (req, res) => {
    try {
        const { name, type, description, price, currency, category, imageUrl } = req.body;

        // Validate type
        const validType = ['product', 'service'].includes(type) ? type : 'product';

        // AI generates keywords automatically
        let autoKeywords = name;
        try {
            const { generateKeywords } = await import('../controllers/aiController.js');
            const kwResult = await generateKeywords(`${name} ${description || ''} ${category || ''}`);
            if (kwResult) autoKeywords = kwResult;
        } catch (aiErr) {
            console.log('⚠️ AI keyword gen failed for product, using name:', aiErr.message);
        }

        await Product.create({
            name,
            type: validType,
            description: description || null,
            price: price ? Math.round(parseFloat(price)) : null,
            currency: (!currency || currency === 'EGP' || currency === 'ج.م') ? 'جنيه' : currency,
            category: category || null,
            images: imageUrl || '[]',
            keywords: autoKeywords,
            UserId: req.user.id
        });

        res.redirect('/dashboard/products?success=1');
    } catch (err) {
        console.error('Add product error:', err);
        res.status(500).send("Error adding product");
    }
});

router.post('/products/edit', async (req, res) => {
    try {
        const { id, name, type, description, price, currency, category, imageUrl, status } = req.body;

        const validType = ['product', 'service'].includes(type) ? type : 'product';
        const validStatus = ['available', 'out_of_stock'].includes(status) ? status : 'available';

        await Product.update({
            name,
            type: validType,
            description: description || null,
            price: price ? Math.round(parseFloat(price)) : null,
            currency: (!currency || currency === 'EGP' || currency === 'ج.م') ? 'جنيه' : currency,
            category: category || null,
            images: imageUrl || '[]',
            status: validStatus
        }, { where: { id, UserId: req.user.id } });

        res.redirect('/dashboard/products?success=1');
    } catch (err) {
        console.error('Edit product error:', err);
        res.status(500).send("Error updating product");
    }
});

router.post('/products/delete', async (req, res) => {
    try {
        const product = await Product.findOne({ where: { id: req.body.id, UserId: req.user.id } });
        if (product) {
            // Delete associated images from disk
            const images = product.images || [];
            for (const img of images) {
                if (img.url) {
                    deleteImage(img.url);
                }
            }
            await product.destroy();
        }
        res.redirect('/dashboard/products');
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).send("Error deleting product");
    }
});

router.post('/products/toggle/:id', async (req, res) => {
    try {
        const product = await Product.findOne({ where: { id: req.params.id, UserId: req.user.id } });
        if (product) {
            product.isActive = !product.isActive;
            await product.save();
        }
        res.redirect('/dashboard/products');
    } catch (err) {
        console.error('Toggle product error:', err);
        res.status(500).send("Error toggling product");
    }
});


router.post('/instructions/edit/:id', async (req, res) => {
    try {
        const { clientName, title, content, actionTarget, imageUrl, keywords } = req.body;

        let finalKeywords = keywords || '';
        // If content changed or we want to force generate keywords
        if (content) {
            try {
                console.log("🧠 Re-generating keywords for edited instruction...");
                const kwResult = await generateKeywords(content);
                if (kwResult) finalKeywords = kwResult;
            } catch (aiError) {
                console.log("⚠️ Keyword generation failed during edit:", aiError.message);
            }
        }

        await Instruction.update({
            clientName, title, content, actionTarget, imageUrl,
            keywords: finalKeywords
        }, { where: { id: req.params.id } });

        res.redirect('/dashboard/instructions');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating instruction");
    }
});

// Alternative route for edit (accepts ID from body instead of URL)
router.post('/instructions/edit', async (req, res) => {
    try {
        const { id, clientName, title, content, actionTarget, imageUrl, keywords } = req.body;

        let finalKeywords = keywords || '';
        // Re-generate keywords
        if (content) {
            try {
                console.log("🧠 Re-generating keywords for edited instruction...");
                const kwResult = await generateKeywords(content);
                if (kwResult) finalKeywords = kwResult;
            } catch (aiError) {
                console.log("⚠️ Keyword generation failed during edit:", aiError.message);
            }
        }

        await Instruction.update({
            clientName, title, content, actionTarget, imageUrl,
            keywords: finalKeywords
        }, { where: { id: id } });

        res.redirect('/dashboard/instructions');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating instruction");
    }
});


// [RESTORED] Missing Routes
router.post('/instructions/toggle/:id', async (req, res) => {
    try {
        const instruction = await Instruction.findOne({ where: { id: req.params.id } });
        if (instruction) {
            instruction.isActive = !instruction.isActive;
            await instruction.save();
        }
        res.redirect('/dashboard/instructions');
    } catch (err) { res.status(500).send("Error"); }
});

router.post('/instructions/delete', async (req, res) => {
    try {
        await Instruction.destroy({ where: { id: req.body.id } });
        res.redirect('/dashboard/instructions');
    } catch (err) { res.status(500).send("Error"); }
});

router.post('/instructions/delete-multiple', async (req, res) => {
    try {
        const { ids, action } = req.body;
        if (action === 'all') {
            await Instruction.destroy({ where: { UserId: req.user.id } });
        } else if (ids && Array.isArray(ids)) {
            await Instruction.destroy({ where: { id: ids, UserId: req.user.id } });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete instructions" });
    }
});

router.post('/chats/delete', async (req, res) => {
    try {
        const { remoteJid } = req.body;
        await Message.destroy({
            where: {
                remoteJid,
                UserId: req.user.id
            }
        });
        res.redirect('/dashboard/chats');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting chat");
    }
});

// ============================================
// Training / Simulator Routes (المرحلة الثالثة)
// ============================================

router.post('/training/setup-wizard', async (req, res) => {
    try {
        const { botName, businessType, firstServiceName, serviceDetails, serviceImageUrl, items } = req.body;
        
        // Handle Identity (if botName provided)
        if (botName) {
            const identityContent = `أنت موظف خدمة العملاء ومسؤول المبيعات. اسمك هو ${botName}. مهمتك مساعدة العملاء والإجابة على استفساراتهم باحترافية واحترام وود.`;
            
            // Check if identity exists
            let identityInst = await Instruction.findOne({ where: { UserId: req.user.id, type: 'global' } });
            if (identityInst) {
                identityInst.content = identityContent;
                identityInst.keywords = 'اسمك ايه, انت مين, وظيفتك, مين معايا';
                await identityInst.save();
            } else {
                await Instruction.create({
                    clientName: 'إعدادات عامة',
                    title: 'هوية البوت واسمه',
                    content: identityContent,
                    actionTarget: '',
                    imageUrl: '',
                    UserId: req.user.id,
                    keywords: 'اسمك ايه, انت مين, وظيفتك, مين معايا',
                    type: 'global'
                });
            }
        }

        // Process dynamic items list
        if (items && Array.isArray(items)) {
            for (const item of items) {
                if (item.name && item.details) {
                    const isService = item.type === 'خدمة';
                    const isProduct = item.type === 'منتج';
                    let serviceContent = '';
                    
                    if (isService) {
                        serviceContent = `نحن نقدم خدمة: ${item.name}.\nتفاصيل الخدمة والاستفادة منها: ${item.details}`;
                    } else if (isProduct) {
                        serviceContent = `نوفر لك المنتج الرائع: ${item.name}.\nالمواصفات والسعر: ${item.details}`;
                    } else {
                        serviceContent = `${item.name}: ${item.details}`;
                    }

                    let keywordsStr = `${item.name}, السعر, بكام, تفاصيل, معلومات عن`;
                    if (isProduct) keywordsStr += `, مقاس, الوان, متاح`;
                    else if (isService) keywordsStr += `, حجز, موعد, ميعاد`;

                    await Instruction.create({
                        clientName: isService ? 'الخدمات' : (isProduct ? 'المنتجات' : 'أخرى'),
                        title: item.name,
                        content: serviceContent,
                        actionTarget: '',
                        imageUrl: item.image || '',
                        UserId: req.user.id,
                        keywords: keywordsStr,
                        type: 'topic'
                    });
                }
            }
        }

        res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح!' });
    } catch (err) {
        console.error("Setup Wizard Error:", err);
        res.status(500).json({ error: "Mission failed. Please try again." });
    }
});

router.get('/training', async (req, res) => {
    try {
        const messages = await SimulationMessage.findAll({
            where: { UserId: req.user.id },
            order: [['createdAt', 'ASC']]
        });
        
        const teachMessages = await TeachMessage.findAll({
            where: { UserId: req.user.id },
            order: [['createdAt', 'ASC']]
        });

        // Count tokens
        const user = await User.findByPk(req.user.id);
        const tokensUsed = user.total_tokens || 0;

        // ======================================================
        // 📚 المقترح 2 و 3: جلب التعليمات لعرض ID و Keywords
        // ======================================================
        const instructions = await Instruction.findAll({
            where: { UserId: req.user.id },
            order: [['order', 'ASC'], ['createdAt', 'DESC']],
            attributes: ['id', 'clientName', 'title', 'keywords', 'type', 'isActive', 'createdAt']
        });

        res.render('training', { 
            user: req.user, 
            page: 'training',
            messages,
            teachMessages,
            tokensUsed,
            instructions
        });
    } catch (err) {
        console.error("Training page error:", err);
        res.status(500).send("Error loading training page");
    }
});


router.post('/training/send', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message is required" });

        // Save User Message to Training DB
        const savedMessage = await SimulationMessage.create({
            role: 'user',
            content: message,
            UserId: req.user.id
        });

        // Get AI Reply
        const aiReply = await simulateChat(req.user.id, message);

        // Save AI Reply to Training DB
        let aiSavedMessage = null;
        if (aiReply) {
            aiSavedMessage = await SimulationMessage.create({
                role: 'model',
                content: aiReply,
                UserId: req.user.id
            });
        }

        res.json({ success: true, aiReply: aiSavedMessage });
    } catch (err) {
        console.error("Training send error:", err);
        res.status(500).json({ error: "Failed to send message" });
    }
});

router.post('/training/clear', async (req, res) => {
    try {
        await SimulationMessage.destroy({
            where: { UserId: req.user.id }
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Training clear error:", err);
        res.status(500).json({ error: "Failed to clear chat" });
    }
});

// Teach Bot Routes
router.post('/training/teach', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: "Message is required" });

        await TeachMessage.create({ role: 'user', content: message, UserId: req.user.id });

        const aiReply = await teachBot(req.user.id, message);

        let aiSavedMessage = null;
        if (aiReply) {
            aiSavedMessage = await TeachMessage.create({ role: 'model', content: aiReply, UserId: req.user.id });
        }

        res.json({ success: true, aiReply: aiSavedMessage });
    } catch (err) {
        console.error("Teach send error:", err);
        res.status(500).json({ error: "Failed to send message" });
    }
});

router.post('/training/clear-teach', async (req, res) => {
    try {
        await TeachMessage.destroy({ where: { UserId: req.user.id } });
        res.json({ success: true });
    } catch (err) {
        console.error("Teach clear error:", err);
        res.status(500).json({ error: "Failed to clear chat" });
    }
});




// Profile Routes
router.get('/profile', (req, res) => {
    res.render('profile', { user: req.user, page: 'profile' });
});

router.post('/profile/update-settings', upload.single('bot_logo'), async (req, res) => {
    try {
        const { bot_name } = req.body;
        const user = await User.findByPk(req.user.id);
        
        let currentSettings;
        if (typeof user.settings === 'string') {
            try {
                currentSettings = JSON.parse(user.settings);
            } catch (e) {
                currentSettings = {};
            }
        } else {
            currentSettings = { ...(user.settings || {}) };
        }
        
        if (bot_name) {
            currentSettings.bot_name = bot_name;
        }
        
        if (req.file) {
            // Compress and save the uploaded image
            const imageUrl = await compressAndSaveImage(req.file);
            currentSettings.bot_logo = imageUrl;
        }
        
        user.settings = currentSettings;
        user.changed('settings', true);
        await user.save();
        
        req.login(user, (err) => {
            if (err) {
                console.error(err);
                return res.render('profile', { user, page: 'profile', error: 'حدث خطأ أثناء تحديث الجلسة' });
            }
            res.render('profile', { user, page: 'profile', success: 'تم تحديث الاسم والشعار بنجاح!' });
        });
    } catch (err) {
        console.error(err);
        res.render('profile', { user: req.user, page: 'profile', error: 'حدث خطأ أثناء تحديث الإعدادات' });
    }
});

router.post('/profile/password', async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
            return res.render('profile', { user: req.user, page: 'profile', error: 'كلمة المرور الجديدة غير متطابقة!' });
        }

        const user = await User.findByPk(req.user.id);
        const isValid = await user.validPassword(currentPassword);

        if (!isValid) {
            return res.render('profile', { user: req.user, page: 'profile', error: 'كلمة المرور الحالية غير صحيحة!' });
        }

        user.password = newPassword;
        await user.save(); // Hooks will hash it

        res.render('profile', { user: req.user, page: 'profile', success: true });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating password");
    }
});


// Privacy Policy Route
router.get('/privacy', (req, res) => {
    res.render('privacy_policy', { user: req.user, page: 'privacy' });
});

// Image Upload Routes
router.post('/instructions/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image uploaded' });
        }

        // Compress and save image
        const imageUrl = await compressAndSaveImage(req.file);

        res.json({ imageUrl });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

router.post('/instructions/delete-image', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        deleteImage(imageUrl);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

// ============================================================
// 💬 LIVE CHAT - Human Handoff Routes
// ============================================================
router.get('/livechat', async (req, res) => {
    try {
        const conversations = await Conversation.findAll({
            where: { UserId: req.user.id },
            order: [['lastMessageAt', 'DESC']],
            limit: 100
        });
        const handoffCount = conversations.filter(c => c.is_handoff).length;
        res.render('livechat', {
            user: req.user,
            page: 'livechat',
            conversations: JSON.parse(JSON.stringify(conversations)),
            handoffCount
        });
    } catch (err) {
        console.error('LiveChat error:', err);
        res.status(500).send('Error loading live chat');
    }
});

router.get('/livechat/:remoteJid/messages', async (req, res) => {
    try {
        const { remoteJid } = req.params;
        const decodedJid = decodeURIComponent(remoteJid);
        const messages = await Message.findAll({
            where: { UserId: req.user.id, remoteJid: decodedJid },
            order: [['createdAt', 'ASC']],
            limit: 50
        });
        // Reset unread count
        await Conversation.update(
            { unreadCount: 0 },
            { where: { UserId: req.user.id, remoteJid: decodedJid } }
        );
        res.json({ success: true, messages });
    } catch (err) {
        console.error('GetMessages error:', err);
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

router.post('/livechat/send', async (req, res) => {
    try {
        const { remoteJid, text } = req.body;
        if (!remoteJid || !text) return res.status(400).json({ error: 'remoteJid and text required' });
        const savedMsg = await sendManualMessage(req.user.id, remoteJid, text);
        res.json({ success: true, message: savedMsg });
    } catch (err) {
        console.error('SendManual error:', err);
        res.status(500).json({ error: err.message || 'Failed to send message' });
    }
});

router.post('/livechat/handoff', async (req, res) => {
    try {
        const { remoteJid, enable } = req.body;
        if (!remoteJid) return res.status(400).json({ error: 'remoteJid required' });
        await Conversation.update(
            { is_handoff: enable === true || enable === 'true' },
            { where: { UserId: req.user.id, remoteJid } }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Handoff error:', err);
        res.status(500).json({ error: 'Failed to update handoff' });
    }
});

// ============================================================
// 📊 ANALYTICS ROUTES
// ============================================================
router.get('/analytics', async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const today = new Date(); today.setHours(0,0,0,0);

        // Total messages
        const totalMessages = await Message.count({ where: { UserId: userId } });
        const inbound = await Message.count({ where: { UserId: userId, role: 'user' } });
        const outbound = await Message.count({ where: { UserId: userId, role: 'model' } });

        // Total unique conversations
        const totalConversations = await Conversation.count({ where: { UserId: userId } });
        const handoffCount = await Conversation.count({ where: { UserId: userId, is_handoff: true } });

        // Messages today
        const messagesToday = await Message.count({
            where: { UserId: userId, createdAt: { [Op.gte]: today } }
        });

        // Messages last 7 days per day (for chart)
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date(now); dayStart.setDate(dayStart.getDate() - i); dayStart.setHours(0,0,0,0);
            const dayEnd = new Date(dayStart); dayEnd.setHours(23,59,59,999);
            const count = await Message.count({
                where: { UserId: userId, createdAt: { [Op.between]: [dayStart, dayEnd] } }
            });
            last7Days.push({
                label: dayStart.toLocaleDateString('ar-EG', { weekday: 'short' }),
                count
            });
        }

        // Top instructions by keyword hits
        const instructions = await Instruction.findAll({
            where: { UserId: userId, isActive: true },
            attributes: ['id','clientName','keywords','type'],
            limit: 10,
            order: [['createdAt','DESC']]
        });

        // Token usage
        const user = await User.findByPk(userId);
        const tokensUsed = user.total_tokens || 0;

        res.render('analytics', {
            user: req.user,
            page: 'analytics',
            totalMessages,
            inbound,
            outbound,
            totalConversations,
            handoffCount,
            messagesToday,
            last7Days: JSON.stringify(last7Days),
            instructions,
            tokensUsed
        });
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).send('Error loading analytics');
    }
});

// Analytics JSON API (for date filter)
router.get('/analytics/data', async (req, res) => {
    try {
        const userId = req.user.id;
        const days = parseInt(req.query.days) || 7;
        const now = new Date();
        const today = new Date(); today.setHours(0,0,0,0);
        const dateFilter = days > 0 ? { [Op.gte]: new Date(now - days * 24 * 60 * 60 * 1000) } : {};
        const msgWhere = days > 0 ? { UserId: userId, createdAt: dateFilter } : { UserId: userId };

        const totalMessages = await Message.count({ where: msgWhere });
        const inbound  = await Message.count({ where: { ...msgWhere, role: 'user' } });
        const outbound = await Message.count({ where: { ...msgWhere, role: 'model' } });
        const convWhere = days > 0 ? { UserId: userId, lastMessageAt: dateFilter } : { UserId: userId };
        const totalConversations = await Conversation.count({ where: convWhere });
        const handoffCount = await Conversation.count({ where: { ...convWhere, is_handoff: true } });
        const messagesToday = await Message.count({ where: { UserId: userId, createdAt: { [Op.gte]: today } } });

        // Chart: build N days of data
        const numDays = days > 0 ? Math.min(days, 90) : 30;
        const chartData = [];
        for (let i = numDays - 1; i >= 0; i--) {
            const dayStart = new Date(now); dayStart.setDate(dayStart.getDate() - i); dayStart.setHours(0,0,0,0);
            const dayEnd = new Date(dayStart); dayEnd.setHours(23,59,59,999);
            const count = await Message.count({ where: { UserId: userId, createdAt: { [Op.between]: [dayStart, dayEnd] } } });
            chartData.push({ label: dayStart.toLocaleDateString('ar-EG', { weekday: 'short', month: 'numeric', day: 'numeric' }), count });
        }

        res.json({ totalMessages, inbound, outbound, totalConversations, handoffCount, messagesToday, chartData });
    } catch (err) {
        console.error('Analytics Data API error:', err);
        res.status(500).json({ error: 'Failed to load analytics data' });
    }
});

// Broadcast Page
router.get('/broadcast', async (req, res) => {
    try {
        const userId = req.user.id;
        const campaigns = await Campaign.findAll({
            where: { UserId: userId },
            order: [['createdAt', 'DESC']]
        });
        const handoffCount = await Conversation.count({ where: { UserId: userId, is_handoff: true } });
        const targetCount = await Conversation.count({ where: { UserId: userId } });

        res.render('broadcast', {
            user: req.user,
            page: 'broadcast',
            campaigns,
            handoffCount,
            targetCount
        });
    } catch (err) {
        console.error('Broadcast page error:', err);
        res.status(500).send('Error loading broadcasts');
    }
});

// Broadcast API - create and start a campaign (for now runs synchronously in background asynchronously)
router.post('/broadcast/send', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, message, filterDays, platform, minDelay, maxDelay } = req.body;
        
        if (!name || !message) {
            return res.status(400).json({ success: false, error: 'الاسم والرسالة مطلوبان' });
        }
        
        const plat = platform === 'messenger' ? 'messenger' : 'whatsapp';
        const delayMin = parseInt(minDelay) || 30;
        const delayMax = parseInt(maxDelay) || 60;

        // Identify targets
        const whereClause = { UserId: userId };
        if (filterDays && filterDays > 0) {
            const dateFilter = new Date();
            dateFilter.setDate(dateFilter.getDate() - filterDays);
            whereClause.lastMessageAt = { [Op.gte]: dateFilter };
        }
        
        let targets = [];
        if (plat === 'whatsapp') {
            targets = await Conversation.findAll({ where: whereClause });
        } else {
            targets = await MessengerConversation.findAll({ where: whereClause });
        }
        
        if (targets.length === 0) {
            return res.status(400).json({ success: false, error: 'لا يوجد عملاء مطابقين للفلتر' });
        }

        const campaign = await Campaign.create({
            name,
            message,
            platform: plat,
            status: 'running',
            targetCount: targets.length,
            UserId: userId
        });

        res.json({ success: true, campaignId: campaign.id, message: `بدأ الإرسال لـ ${targets.length} عميل` });

        // Background process to send messages
        import('../controllers/broadcastController.js').then(module => {
            module.runBroadcastCampaign(campaign.id, targets, message, userId, plat, delayMin, delayMax);
        }).catch(err => {
            console.error('Could not load broadcast controller', err);
        });

    } catch (err) {
        console.error('Broadcast send error:', err);
        res.status(500).json({ success: false, error: 'We encountered an error starting the broadcast' });
    }
});

// Toggle Inactivity Summary
router.post('/toggle-inactivity-summary', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ success: false });
        
        user.inactivity_summary = req.body.enabled;
        await user.save();
        
        res.json({ success: true });
    } catch (err) {
        console.error('Toggle inactivity summary error:', err);
        res.status(500).json({ success: false });
    }
});

// ======================================================
// 🔘 Interactive Buttons Routes
// ======================================================

// Buttons Page
router.get('/buttons', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Fetch all menus with their buttons
        const menus = await InteractiveMenu.findAll({
            where: { UserId: userId },
            include: [{
                model: InteractiveButton,
                order: [['order', 'ASC'], ['createdAt', 'ASC']]
            }],
            order: [['createdAt', 'ASC']]
        });
        
        const products = await Product.findAll({ where: { UserId: userId, isActive: true }, order: [['createdAt', 'DESC']] });
        const handoffCount = await Conversation.count({ where: { UserId: userId, is_handoff: true } });
        const currentUser = await User.findByPk(userId);
        res.render('interactive_buttons', { user: req.user, page: 'buttons', menus, products, handoffCount, botMode: currentUser.bot_mode || 'hybrid' });
    } catch (err) {
        console.error('Buttons page error:', err);
        res.status(500).send('Error loading buttons page');
    }
});

// Set Bot Mode
router.post('/set-bot-mode', async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ success: false });
        
        const validModes = ['ai_only', 'hybrid', 'menu_only'];
        const newMode = req.body.mode;
        
        if (validModes.includes(newMode)) {
            user.bot_mode = newMode;
            await user.save();
            console.log(`[Bot-Mode] User ${user.id} changed mode to: ${user.bot_mode}`);
            res.json({ success: true, mode: user.bot_mode });
        } else {
            res.status(400).json({ success: false, error: 'Invalid mode' });
        }
    } catch (err) {
        console.error('Set bot mode error:', err);
        res.status(500).json({ success: false });
    }
});

// ======================================================
// 📑 Menus CRUD
// ======================================================
router.post('/menus/add', async (req, res) => {
    try {
        const userId = req.user.id;
        const { menuName, triggerWords, welcomeMessage } = req.body;
        
        if (!menuName || !triggerWords) return res.redirect('/dashboard/buttons');
        
        await InteractiveMenu.create({
            UserId: userId,
            menuName,
            triggerWords,
            welcomeMessage: welcomeMessage || null
        });
        res.redirect('/dashboard/buttons');
    } catch(err) {
        console.error(err);
        res.redirect('/dashboard/buttons');
    }
});

router.post('/menus/edit', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id, menuName, triggerWords, welcomeMessage } = req.body;
        
        const menu = await InteractiveMenu.findOne({ where: { id, UserId: userId } });
        if(menu) {
            menu.menuName = menuName;
            menu.triggerWords = triggerWords;
            menu.welcomeMessage = welcomeMessage || null;
            await menu.save();
        }
        res.redirect('/dashboard/buttons');
    } catch(err) {
        console.error(err);
        res.redirect('/dashboard/buttons');
    }
});

router.post('/menus/delete', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.body;
        await InteractiveMenu.destroy({ where: { id, UserId: userId } });
        res.redirect('/dashboard/buttons');
    } catch(err) {
        console.error(err);
        res.redirect('/dashboard/buttons');
    }
});

router.post('/menus/set-default', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.body;
        
        // Remove default from all other menus
        await InteractiveMenu.update({ isDefault: false }, { where: { UserId: userId } });
        
        // Set this menu as default
        await InteractiveMenu.update({ isDefault: true }, { where: { id, UserId: userId } });
        
        res.redirect('/dashboard/buttons');
    } catch(err) {
        console.error(err);
        res.redirect('/dashboard/buttons');
    }
});

// Add Button
router.post('/buttons/add', upload.single('responseImageFile'), async (req, res) => {
    try {
        const userId = req.user.id;
        const { label, responseText, responseImage, platform, continueToAI, order, MenuId, NextMenuId, ProductId } = req.body;

        if (!label || !responseText || !MenuId) {
            return res.redirect('/dashboard/buttons');
        }

        let finalImage = responseImage || null;
        if (req.file) {
            const filename = await compressAndSaveImage(req.file.buffer, req.file.originalname);
            finalImage = '/uploads/' + filename;
        }

        // Auto-generate buttonId from label (safe, unique per user)
        const baseId = 'btn_' + label
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .trim()
            .replace(/\s+/g, '_')
            .substring(0, 30)
            .toLowerCase();
        // Ensure uniqueness by appending timestamp
        const buttonId = baseId + '_' + Date.now();

        await InteractiveButton.create({
            UserId: userId,
            MenuId: parseInt(MenuId),
            label: label.substring(0, 20), // Messenger limit
            buttonId,
            responseText,
            responseImage: finalImage,
            platform: ['both', 'whatsapp', 'messenger'].includes(platform) ? platform : 'both',
            continueToAI: continueToAI === 'true',
            NextMenuId: NextMenuId ? parseInt(NextMenuId) : null,
            ProductId: ProductId ? parseInt(ProductId) : null,
            order: parseInt(order) || 0
        });

        res.redirect('/dashboard/buttons');
    } catch (err) {
        console.error('Add button error:', err);
        res.status(500).send('Error adding button');
    }
});

// Edit Button
router.post('/buttons/edit', upload.single('responseImageFile'), async (req, res) => {
    try {
        const userId = req.user.id;
        const { id, label, responseText, responseImage, platform, continueToAI, order, NextMenuId, ProductId } = req.body;

        if (!id || !label || !responseText) {
            return res.redirect('/dashboard/buttons');
        }

        const button = await InteractiveButton.findOne({ where: { id, UserId: userId } });
        if (!button) return res.redirect('/dashboard/buttons');

        button.label = label.substring(0, 20);
        button.responseText = responseText;
        if (req.file) {
            const filename = await compressAndSaveImage(req.file.buffer, req.file.originalname);
            button.responseImage = '/uploads/' + filename;
        } else if (responseImage) {
            button.responseImage = responseImage;
        } else if (responseImage === '') { // Allow clearing image
            button.responseImage = null;
        }
        button.platform = ['both', 'whatsapp', 'messenger'].includes(platform) ? platform : 'both';
        button.continueToAI = continueToAI === 'true';
        button.NextMenuId = NextMenuId ? parseInt(NextMenuId) : null;
        button.ProductId = ProductId ? parseInt(ProductId) : null;
        button.order = parseInt(order) || 0;
        await button.save();

        res.redirect('/dashboard/buttons');
    } catch (err) {
        console.error('Edit button error:', err);
        res.status(500).send('Error editing button');
    }
});

// Delete Button
router.post('/buttons/delete', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.body;

        if (!id) return res.redirect('/dashboard/buttons');

        await InteractiveButton.destroy({ where: { id, UserId: userId } });
        res.redirect('/dashboard/buttons');
    } catch (err) {
        console.error('Delete button error:', err);
        res.status(500).send('Error deleting button');
    }
});

// Toggle Button Active/Inactive
router.post('/buttons/toggle/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const button = await InteractiveButton.findOne({ where: { id, UserId: userId } });
        if (!button) return res.redirect('/dashboard/buttons');

        button.isActive = !button.isActive;
        await button.save();

        res.redirect('/dashboard/buttons');
    } catch (err) {
        console.error('Toggle button error:', err);
        res.status(500).send('Error toggling button');
    }
});

// Reorder Buttons (API)
router.post('/buttons/reorder', async (req, res) => {
    try {
        const userId = req.user.id;
        const { buttonOrders } = req.body;

        if (!Array.isArray(buttonOrders)) {
            return res.status(400).json({ success: false, error: 'Invalid data' });
        }

        for (const item of buttonOrders) {
            if (item.id && typeof item.order === 'number') {
                await InteractiveButton.update(
                    { order: item.order },
                    { where: { id: item.id, UserId: userId } }
                );
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Reorder buttons error:', err);
        res.status(500).json({ success: false, error: 'Error reordering buttons' });
    }
});

export default router;
